const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pickups = [];

app.get('/', (req, res) => {
  res.send('Hello from the Waste Management Backend! 👋');
});


app.get('/api/pickups', (req, res) => {
  
  res.status(200).send(pickups);
});
app.post('/api/schedule', (req, res) => {
  const { wasteType, address } = req.body;

  if (!wasteType || !address) {
    return res.status(400).send({ message: 'Waste type and address are required.' });
  }
  
  const newPickup = {
    id: pickups.length + 1,
    wasteType: wasteType,
    address: address,
    status: 'Pending'
  };

  pickups.push(newPickup);
  console.log('All pickups:', pickups);

  res.status(201).send({ message: 'Pickup scheduled successfully!', pickup: newPickup });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
