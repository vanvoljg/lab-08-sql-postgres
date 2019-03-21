'use strict';

// ============================================================================
// SERVER CONFIGURATION
// 
require('dotenv').config();

const superagent = require('superagent');
const express = require('express');
const pg = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT;

// Create client connection to DB
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('error', error => console.error(error));

// ============================================================================
// API ROUTES
// location route, returns location object
// Keys: search_query, formatted_query, latitude and longitude
app.get('/location', getLocation);
// weather route, returns an array of forecast objects
app.get('/weather', getWeather);
// Meetup route, returns an array of meetup objects
app.get('/meetups', getMeetups);

// TODO: create a getYelp function
// app.get('/yelp', getYelp);

// '*' route for invalid endpoints
app.use('*', (req, res) => res.send('Sorry, that route does not exist'));

app.listen(PORT, () => console.log(`Listening on PORT ${PORT}`));

function handleError(err, res) {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}

// HELPER FUNCTIONS

// PREVIOUS getLocation function
// function getLocation(req, res){
//   const mapsURL = `https://maps.googleapis.com/maps/api/geocode/json?key=${process.env.GOOGLE_MAPS_API_KEY}&address=${req.query.data}`;
//   return superagent.get(mapsURL)
//     .then(result => {
//       res.send(new Location(result.body.results[0], req.query.data));
//     })
//     .catch(error => handleError(error));
// }

// takes search request and convert to location object
function getLocation(req, res) {
  // Check DB to see if location exists
  let query = req.query.data;

  // Define the SQL query
  let sql = `SELECT * FROM locations WHERE search_query=$1;`;
  let values = [query];

  // make databse query
  client.query(sql, values)
    .then( result => {

      // if the location is in the database, return to front end
      if (result.rowCount > 0) {
        console.log('LOCATION FROM SQL');
        res.send(result.rows[0]);
      } else {

        // if not in database, get data from API
        const url = `https://maps.googleapis.com/maps/api/geocode/json?key=${process.env.GOOGLE_MAPS_API_KEY}&address=${req.query.data}`;
        superagent.get(url)
          .then(data => {
            console.log('LOCATION FROM API');

            // If there's an error or problem with the API
            if (!data.body.results.length) throw 'NO DATA';

            // if there IS data
            else {
              let location = new Location(query, data.body.results[0]);

              // Create query to add data to SQL db
              let newSql = `INSERT INTO locations(search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING id;`;
              let newValues = Object.values(location);

              // insert data into DB and get the new ID, attach to object
              client.query(newSql, newValues)
                .then(result => {
                  location.id = result.rows[0].id;

                  // return location data to front end
                  res.send(location);
                });
            }
          })
          .catch(error => handleError(error, res));
      }
    });
}

// Location object constructor
function Location(query, data) {
  this.search_query = query;
  this.formatted_query = data.formatted_address;
  this.latitude = data.geometry.location.lat;
  this.longitude = data.geometry.location.lng;
}

// returns array of daily forecasts
// function getWeather(req, res) {
//   const dark_sky_url = `https://api.darksky.net/forecast/${process.env.DARK_SKY_API_KEY}/${req.query.data.latitude},${req.query.data.longitude}`;

//   return superagent.get(dark_sky_url)
//     .then( weatherResult => {
//       const weatherSummaries = weatherResult.body.daily.data.map((day) => {
//         return new Forecast(day);
//       });
//       res.send(weatherSummaries);
//     })
//     .catch(error => handleError(error));
// }

function getWeather(req, res) {
  let query = req.query.data.id; // internally, we use the unique id from the locations table to find unique data
  // build sql query to get weather for current location
  let sql = `SELECT * FROM weathers WHERE location_id=$1;`;
  let values = [query];
  // run query
  client.query(sql, values)
    .then(result => {
      if (result.rowCount > 0) { // if we got data from SQL, send it back
        console.log('WEATHER RESULT FROM SQL');
        res.send(result.rows);
      } else { // if we got no data from SQL, make API call to get data
        const url = `https://api.darksky.net/forecast/${process.env.DARK_SKY_API_KEY}/${req.query.data.latitude},${req.query.data.longitude}`;
        superagent.get(url)
          .then(weatherResults => {
            console.log('WEATHER FROM API');
            if (!weatherResults.body.daily.data.length) throw 'NO DATA'; // if we get no data from API call, throw error
            else { // otherwise, process data through constructor
              const weatherSummaries = weatherResults.body.daily.data.map(day => {
                let summary = new Forecast(day); // create Forecast object for each day
                summary.location_id = query; // attach location id to each day's forecast
                
                // create query to insert data into db
                let newSql = `INSERT INTO weathers(forecast,time,location_id) VALUES($1, $2, $3);`;
                let newValues = Object.values(summary);

                client.query(newSql, newValues);// insert data into DB
                return summary;
              });
              res.send(weatherSummaries); // once weather array is created, send back to front end
            }
          })
          .catch(error => handleError(error, res)); // any superagent errors handled here
      }
    });
}

// Forecast object constructor
function Forecast(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time*1000).toString().slice(0,15);
}

// returns array of 20 meetup objects
// function getMeetups(req, res) {
//   const meetupUrl = `https://api.meetup.com/find/upcoming_events?lat=${req.query.data.latitude}&lon=${req.query.data.longitude}&sign=true&key=${process.env.MEETUP_API_KEY}&page=20`;

//   return superagent.get(meetupUrl)
//     .then( meetupResults => {
//       const meetupList = meetupResults.body.events.map((event) => {
//         return new MeetupEvent(event);
//       });
//       res.send(meetupList);
//     })
//     .catch(error => handleError(error));
// }

function getMeetups(req, res) {
  let query = req.query.data.id;
  let sql = `SELECT * FROM meetups WHERE location_id=$1;`;
  let values = [query];

  client.query(sql, values)
    .then(result => {
      if (result.rowCount > 0) {
        console.log('MEETUPS RESULT FROM SQL');
        res.send(result.rows);
      } else {
        const url = `https://api.meetup.com/find/upcoming_events?lat=${req.query.data.latitude}&lon=${req.query.data.longitude}&sign=true&key=${process.env.MEETUP_API_KEY}&page=20`;

        superagent.get(url)
          .then(meetupResults => {
            console.log('MEETUPS FROM API');
            if (!meetupResults.body.events.length) throw 'NO DATA';
            else {
              const meetupArray = meetupResults.body.events.map(event => {
                let meetup = new MeetupEvent(event);
                meetup.location_id = query;

                let newSql = `INSERT INTO meetups(link, name, creation_date, host, location_id) VALUES($1, $2, $3, $4, $5);`;
                let newValues = Object.values(meetup);
                
                client.query(newSql, newValues);
                
                return meetup;
              });
              res.send(meetupArray);
            }
          })
          .catch(error => handleError(error, res));
      }
    })
    .catch(error => handleError(error, res));
    
}

// Meetup event object constructor
function MeetupEvent(event) {
  this.link = event.link;
  this.name = event.name;
  this.creation_date = new Date(event.time).toString().slice(0, 15);
  this.host = event.group.name;
}
