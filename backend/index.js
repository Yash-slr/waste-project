const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// --- Connect to MongoDB ---
mongoose.connect(process.env.DATABASE_URL)
  .then(() => console.log('Database connected successfully!'))
  .catch((err) => console.error('Database connection error:', err));

// ===================================
// --- 1. DATABASE MODELS (SCHEMAS) ---
// ===================================

// --- "User" Schema (NOW WITH 'ngo' ROLE) ---
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'driver', 'admin', 'ngo'], default: 'user' }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

const User = mongoose.model('User', userSchema);


// --- "Pickup" Schema (Same as before) ---
const pickupSchema = new mongoose.Schema({
  wasteType: String,
  address: String,
  status: { type: String, default: 'Pending' }
});
const Pickup = mongoose.model('Pickup', pickupSchema);


// --- NEW: "NGO" Schema ---
const ngoSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: { type: String, default: 'This NGO is dedicated to helping the community.' }
});
const NGO = mongoose.model('NGO', ngoSchema);


// --- NEW: "Donation" Schema ---
const donationSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  donor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ngo: { type: mongoose.Schema.Types.ObjectId, ref: 'NGO', required: true },
  timestamp: { type: Date, default: Date.now }
});
const Donation = mongoose.model('Donation', donationSchema);


// ===========================================
// --- 2. AUTHENTICATION ROUTES (Public) ---
// ===========================================

// --- "POST" Route for User Registration ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).send({ message: 'Email and password are required.' });
    }
    let user = await User.findOne({ email: email });
    if (user) {
      return res.status(400).send({ message: 'User already exists.' });
    }
    user = new User({ email, password, role: 'user' });
    await user.save();
    res.status(201).send({ message: 'User registered successfully!' });
  } catch (error) {
    res.status(500).send({ message: 'Server error: ' + error.message });
  }
});

// --- NEW: "POST" Route for NGO Registration ---
app.post('/api/auth/register-ngo', async (req, res) => {
  try {
    const { email, password, name, description } = req.body;
    if (!email || !password || !name) {
      return res.status(400).send({ message: 'Email, password, and NGO name are required.' });
    }
    let user = await User.findOne({ email: email });
    if (user) {
      return res.status(400).send({ message: 'Email is already in use.' });
    }
    user = new User({ email, password, role: 'ngo' });
    await user.save();
    const ngo = new NGO({ user: user._id, name: name, description: description });
    await ngo.save();
    res.status(201).send({ message: 'NGO registered successfully!' });
  } catch (error) {
    res.status(500).send({ message: 'Server error: ' + error.message });
  }
});

// --- "POST" Route for All Logins (NOW COMPLETE) ---
app.post('/api/auth/login', async (req, res) => {
  try {
    console.log("LOGIN ROUTE HIT!"); // Keep this log for now

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).send({ message: 'Email and password are required.' });
    }

    // Find the user
    const user = await User.findOne({ email: email });
    if (!user) {
        console.log("Login failed: User not found for email:", email);
      return res.status(400).send({ message: 'Invalid credentials.' });
    }

    // Check the password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        console.log("Login failed: Password mismatch for email:", email);
      return res.status(400).send({ message: 'Invalid credentials.' });
    }

    // Create and send the "login token" (JWT)
    const payload = {
      userId: user._id,
      role: user.role
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    console.log("Login successful for:", email, "Role:", user.role);

    // Send success response
    res.status(200).send({
      message: 'Login successful!',
      token: token,
      user: {
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login route error:', error);
    res.status(500).send({ message: 'Server error: ' + error.message });
  }
});


// ==============================================
// --- 3. AUTHENTICATION MIDDLEWARE (Private) ---
// ==============================================

const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) {
    return res.status(401).send({ message: 'No token, authorization denied.' });
  }
  try {
    const tokenString = token.split(' ')[1];
    const decoded = jwt.verify(tokenString, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).send({ message: 'Token is not valid.' });
  }
};

// =================================
// --- 4. PROTECTED API ROUTES ---
// =================================

// --- "GET" Route: Hello (Stays Public) ---
app.get('/', (req, res) => {
  res.send('Hello from the Waste Management Backend! 👋');
});

// --- "GET" Route: All Pickups (for Admin) ---
app.get('/api/pickups', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).send({ message: 'Access denied.' });
  }
  try {
    const allPickups = await Pickup.find();
    res.status(200).send(allPickups);
  } catch (error) {
    res.status(500).send({ message: 'Error fetching pickups', error: error });
  }
});

// --- "POST" Route: Schedule Pickup (for User) ---
app.post('/api/schedule', authMiddleware, async (req, res) => {
  if (req.user.role !== 'user') {
    return res.status(403).send({ message: 'Only users can schedule pickups.' });
  }
  try {
    const { wasteType, address } = req.body;
    if (!wasteType || !address) {
      return res.status(400).send({ message: 'Waste type and address are required.' });
    }
    const newPickup = new Pickup({ wasteType, address });
    await newPickup.save();
    res.status(201).send({ message: 'Pickup scheduled successfully!', pickup: newPickup });
  } catch (error) {
    res.status(500).send({ message: 'Error scheduling pickup', error: error });
  }
});

// --- "PATCH" Route: Complete Pickup (for Admin/Driver) ---
app.patch('/api/pickups/:id/complete', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'driver') {
    return res.status(403).send({ message: 'Access denied.' });
  }
  try {
    const updatedPickup = await Pickup.findByIdAndUpdate(req.params.id, { status: 'Completed' }, { new: true });
    if (!updatedPickup) return res.status(404).send({ message: 'Pickup not found' });
    res.status(200).send({ message: 'Pickup marked as completed!', pickup: updatedPickup });
  } catch (error) {
    res.status(500).send({ message: 'Error updating pickup', error: error });
  }
});

// --- "GET" Route: Get Simple A-Z Route (for Driver) ---
app.get('/api/driver/route', authMiddleware, async (req, res) => {
  if (req.user.role !== 'driver') {
    return res.status(403).send({ message: 'Access denied.' });
  }
  try {
    const pendingPickups = await Pickup.find({ status: 'Pending' }).sort({ address: 1 });
    res.status(200).send({ message: 'Route calculated successfully!', pickups: pendingPickups });
  } catch (error) {
    res.status(500).send({ message: 'Error fetching route', error: error });
  }
});


// =================================
// --- 5. NEW NGO & DONATION ROUTES ---
// =================================

// --- NEW: "GET" Route to list all NGOs (for Users) ---
app.get('/api/ngos', authMiddleware, async (req, res) => {
  if (req.user.role !== 'user') {
    return res.status(403).send({ message: 'Only users can see this page.' });
  }
  try {
    const ngos = await NGO.find({}, 'name description');
    res.status(200).send(ngos);
  } catch (error) {
    res.status(500).send({ message: 'Error fetching NGOs: ' + error.message });
  }
});

// --- NEW: "POST" Route to make a donation (for Users) ---
app.post('/api/donate/:ngoId', authMiddleware, async (req, res) => {
  if (req.user.role !== 'user') {
    return res.status(403).send({ message: 'Only users can donate.' });
  }
  try {
    const { amount } = req.body;
    const ngoId = req.params.ngoId;
    const userId = req.user.userId;
    const ngo = await NGO.findById(ngoId);
    if (!ngo) {
      return res.status(404).send({ message: 'NGO not found.' });
    }
    const newDonation = new Donation({ amount: amount, donor: userId, ngo: ngoId });
    await newDonation.save();
    res.status(201).send({ message: `Donation of $${amount} successful!` });
  } catch (error) {
    res.status(500).send({ message: 'Donation failed: ' + error.message });
  }
});

// --- NEW: "GET" Route for Admin to see all donations ---
app.get('/api/donations/admin', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).send({ message: 'Access denied.' });
  }
  try {
    const donations = await Donation.find().populate('donor', 'email').populate('ngo', 'name');
    res.status(200).send(donations);
  } catch (error) {
    res.status(500).send({ message: 'Error fetching donations: ' + error.message });
  }
});

// --- NEW: "GET" Route for an NGO to see their donations ---
app.get('/api/donations/ngo', authMiddleware, async (req, res) => {
  if (req.user.role !== 'ngo') {
    return res.status(403).send({ message: 'Access denied.' });
  }
  try {
    const ngo = await NGO.findOne({ user: req.user.userId });
    if (!ngo) {
      return res.status(404).send({ message: 'NGO profile not found.' });
    }
    const donations = await Donation.find({ ngo: ngo._id }).populate('donor', 'email');
    res.status(200).send(donations);
  } catch (error) {
    res.status(500).send({ message: 'Error fetching donations: ' + error.message });
  }
});


// =================================
// --- 6. START THE SERVER ---
// =================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
