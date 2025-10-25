// Import the Express library
const express = require('express');

// Create our app
const app = express();
const PORT = process.env.PORT || 3000;

// This tells our app to listen for "GET" requests on the main "/" URL
app.get('/', (req, res) => {
  res.send('Hello from the Waste Management Backend! ');
});

// Start the server and listen for connections on the specified port
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
