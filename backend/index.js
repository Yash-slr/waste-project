const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios'); 

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
    const updatedPickup = await Pickup.findByIdAndUpdate(
      req.params.id,
      { status: 'Completed' },
      { new: true }
    );
    if (!updatedPickup) {
      return res.status(4404).send({ message: 'Pickup not found' });
    }
    res.status(200).send({ message: 'Pickup marked as completed!', pickup: updatedPickup });
  } catch (error) {
    res.status(500).send({ message: 'Error updating pickup', error: error });
  }
});

app.get('/api/driver/route', async (req, res) => {
  try {
  
    const pendingPickups = await Pickup.find({ status: 'Pending' });

    if (pendingPickups.length === 0) {
      return res.status(200).send({
        message: 'No pending pickups. You are all clear!',
        pickups: []
      });
    }


    
    const optimizationRequest = {
      services: [],
      vehicles: [{
        vehicle_id: 'driver_1',
        start_address: {
          location_id: 'depot',
          address: '1 Main St, Anytown' 
        }
      }]
    };
    
    pendingPickups.forEach(pickup => {
      optimizationRequest.services.push({
        id: pickup._id.toString(),
        name: pickup.wasteType,
        address: {
          location_id: pickup.address,
          address: pickup.address
        }
      });
    });

    const apiKey = process.env.GRAPHHOPPER_API_KEY;
    const apiUrl = `https://graphhopper.com/api/1/route?key=${apiKey}`;
    
    const optimizationApiUrl = `https://graphhopper.com/api/1/optimization?key=${apiKey}`;

    let response;
    try {
      response = await axios.post(optimizationApiUrl, optimizationRequest);
    } catch (apiError) {
      console.error("GraphHopper API Error:", apiError.response.data);
      throw new Error('Error from routing API: ' + apiError.response.data.message);
    }

    const solution = response.data;
    
    const orderedStops = solution.solution.routes[0].activities;
 
    const sortedPickups = [];
    
    for (const stop of orderedStops) {
      if (stop.type === 'service') {
  
        const foundPickup = pendingPickups.find(p => p._id.toString() === stop.id);
        if (foundPickup) {
          sortedPickups.push(foundPickup);
        }
      }
    }
    
    res.status(200).send({
        message: 'Route calculated successfully!',
        pickups: sortedPickups,
        
        routeData: solution.solution
    });

  } catch (error) {
    console.error('Full route error:', error);
    res.status(500).send({ message: 'Error fetching route: ' + error.message });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
