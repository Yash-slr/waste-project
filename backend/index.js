const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());
mongoose.connect(process.env.DATABASE_URL)
  .then(() => console.log('Database connected successfully!'))
  .catch((err) => console.error('Database connection error:', err));

const pickupSchema = new mongoose.Schema({
  wasteType: String,
  address: String,
  status: { type: String, default: 'Pending' }
});
const Pickup = mongoose.model('Pickup', pickupSchema);

app.get('/', (req, res) => {
  res.send('Hello from the Waste Management Backend! 👋');
});

app.get('/api/pickups', async (req, res) => {
  try {
    const allPickups = await Pickup.find();
    res.status(200).send(allPickups);
  } catch (error) {
    res.status(500).send({ message: 'Error fetching pickups', error: error });
  }
});

app.post('/api/schedule', async (req, res) => {
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

app.patch('/api/pickups/:id/complete', async (req, res) => {
  try {
    const pickupId = req.params.id; 
    
    const updatedPickup = await Pickup.findByIdAndUpdate(
      pickupId,
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


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
