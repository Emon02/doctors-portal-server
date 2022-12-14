const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, Admin } = require('mongodb');
require('dotenv').config();
const port = process.env.PORT || 5000;
const app = express();


// MiddleWare
app.use(cors());
app.use(express.json());


// MongoDb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.c2mwj65.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized Access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' });
        }
        req.decoded = decoded;
        next();
    });
}


async function run() {
    try {
        await client.connect();
        const database = client.db("doctors_portal");
        const servicesCollection = database.collection("services");
        const bookingCollection = database.collection("bookings");
        const userCollection = database.collection("users");
        const doctorsCollection = database.collection("doctors");

        // Services API
        app.get('/services', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services);
        });

        app.get('/booking', verifyJWT, async (req, res) => {
            const patientEmail = req.query.patientEmail;
            const decodedEmail = req.decoded.email;
            if (patientEmail === decodedEmail) {
                const query = { patientEmail: patientEmail };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            } else {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
        });

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })

        app.put('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                res.send(result);
            } else {
                res.status(403).send({ message: 'Forbidden Access' });
            }
        });

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '720h' });
            res.send({ result, token });
        });

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatmentName: booking.treatmentName, date: booking.date, patientEmail: booking.patientEmail };
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        });


        app.get('/available', async (req, res) => {
            const date = req.query.date;
            // step 1: get all services
            const services = await servicesCollection.find().toArray();
            // step 2: get the booking of the day
            const query = { date: date };
            const booking = await bookingCollection.find(query).toArray();
            // step 3: for each service 
            services.forEach(service => {
                // step 4: find bookings for that service
                const serviceBookings = booking.filter(b => b.treatmentName === service.name);
                const booked = serviceBookings.map(s => s.slot);
                const available = service.slots.filter(s => !booked.includes(s));
                service.slots = available;
            })
            res.send(services);
        });

        app.post('/doctor', async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result);
        });













        /**
         * API Naming Convention
         * app.get('/booking') // get all bookings in this collection. or get more than one or by filter
         * app.get('/booking/:id') // get a specific booking 
         * app.post('/booking') // add a new booking
         * app.patch('/booking/:id) // update
         * app.put('/booking/:id) //upsert ==> update(if exist) or insert (if doesn't exist)
         * app.delete('/booking/:id) // delete
        */

    } finally {
        // await client.close();
    }
}
run().catch(console.dir);



// APIs
app.get('/', (req, res) => {
    res.send('Running Server')
});


// Port Listening
app.listen(port, () => {
    console.log('Listening to port', port);
})