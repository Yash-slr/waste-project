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

// --- "Pickup" Schema and Model (Same as before) ---
const pickupSchema = new mongoose.Schema({
  wasteType: String,
  address: String,
  status: { type: String, default: 'Pending' }
});
const Pickup = mongoose.model('Pickup', pickupSchema);


// --- NEW: "User" Schema and Model ---
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'driver', 'admin'], default: 'user' }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

const User = mongoose.model('User', userSchema);


// ===========================================
// --- NEW: AUTHENTICATION ROUTES (Public) ---
// ===========================================

// --- NEW: "POST" Route for User Registration ---
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

    user = new User({ email, password });
    await user.save();

    res.status(201).send({ message: 'User registered successfully!' });

  } catch (error) {
    res.status(500).send({ message: 'Server error: ' + error.message });
  }
});

// --- NEW: "POST" Route for All Logins (User, Admin, Driver) ---
app.post('/api/auth/login', async (req, res) => {
  try {
    // --- THIS IS THE LINE WE FIXED ---
    const { email, password } = req.body; 
    // ---------------------------------
    
    if (!email || !password) {
      return res.status(400).send({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email });
    if (!user) {
      return res.status(400).send({ message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).send({ message: 'Invalid credentials.' });
    }

    const payload = {
      userId: user._id,
      role: user.role
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(200).send({
      message: 'Login successful!',
      token: token,
      user: {
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    res.status(500).send({ message: 'Server error: ' + error.message });
  }
});


// ==============================================
// --- NEW: AUTHENTICATION MIDDLEWARE (Private) ---
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
// --- PROTECTED API ROUTES ---
// =================================

app.get('/', (req, res) => {
  res.send('Hello from the Waste Management Backend! 👋');
});

app.get('/api/pickups', authMiddleware, async (req, res) => {
  try {
    const allPickups = await Pickup.find();
    res.status(200).send(allPickups);
  } catch (error) {
    res.status(500).send({ message: 'Error fetching pickups', error: error });
  }
});

app.post('/api/schedule', authMiddleware, async (req, res) => {
  try {
    const { wasteType, address } = req.body;
    if (!wasteType || !address) {
      return res.status(400).send({ message: 'Waste type and address are required.' });
    }
    const newPickup = new Pickup({
      wasteType: wasteType,
      address: address
    });
    await newPickup.save();
    res.status(201).send({ message: 'Pickup scheduled successfully!', pickup: newPickup });
  } catch (error) {
    res.status(500).send({ message: 'Error scheduling pickup', error: error });
  }
});

app.patch('/api/pickups/:id/complete', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'driver') {
    return res.status(403).send({ message: 'Access denied. Only Admins or Drivers can complete pickups.' });
  }

  try {
    const updatedPickup = await Pickup.findByIdAndUpdate(
      req.params.id,
      { status: 'Completed' },
      { new: true }
    );
    if (!updatedPickup) {
      return res.status(404).send({ message: 'Pickup not found' });
    }
    res.status(200).send({ message: 'Pickup marked as completed!', pickup: updatedPickup });
  } catch (error) {
    res.status(500).send({ message: 'Error updating pickup', error: error });
  }
});

app.get('/api/driver/route', authMiddleware, async (req, res) => {
  if (req.user.role !== 'driver') {
    return res.status(4S03).send({ message: 'Access denied. Only Drivers can get a route.' });
  }
  
  try {
    const pendingPickups = await Pickup.find({ status: 'Pending' })
                                         .sort({ address: 1 });
    
    res.status(200).send({
      message: 'Route calculated successfully!',
      pickups: pendingPickups 
    });
  } catch (error) {
    res.status(500).send({ message: 'Error fetching route', error: error });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
