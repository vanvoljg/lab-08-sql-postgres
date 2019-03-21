'use strict';

require('dotenv').config();

const superagent = require('superagent');
const express = require('express');
const app = express();

const cors = require('cors');
app.use(cors());

const PORT = process.env.PORT;


// location route, returns location object
// Keys: search_query, formatted_query, latitude and longitude
app.get('/location', getLocation);

// weather route, returns an array of forecast objects
// Keys: forecast, time
app.get('/weather', getWeather);



// TODO: create a getMeetups function
// [ { link:,
// name:,
// creation_date:,
// host:}, ]
// app.get('/meetups', getMeetups);
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

// takes search request and convert to location object
function getLocation(req, res) {
  const mapsURL = `https://maps.googleapis.com/maps/api/geocode/json?key=${process.env.GOOGLE_MAPS_API_KEY}&address=${req.query.data}`;
  return superagent.get(mapsURL)
    .then(result => {
      res.send(new Location(result.body.results[0], req.query.data));
    })
    .catch(error => handleError(error));
}

// returns array of daily forecasts
function getWeather(req, res) {
  const dark_sky_url = `https://api.darksky.net/forecast/${process.env.DARK_SKY_API_KEY}/${req.query.data.latitude},${req.query.data.longitude}`;
  
  return superagent.get(dark_sky_url)
    .then( weatherResult => {
      const weatherSummaries = weatherResult.body.daily.data.map((day) => {
        return new Forecast(day);
      });
      res.send(weatherSummaries);
    })
    .catch(error => handleError(error));
}

// returns array of 20 meetup objects
function getMeetups(req, res) {
  const meetupUrl = `https://api.meetup.com/find/upcoming_events?lat=${req.query.data.latitude}&lon=${req.query.data.longitude}&sign=true&key=${process.env.MEETUP_API_KEY}&page=20`;

  return superagent.get(meetupUrl)
    .then( meetupResults => {
      const meetupList = meetupResults.body.events.map((event) => {
        return new MeetupEvent(event);
      });
      res.send(meetupList);
    })
    .catch(error => handleError(error));
}

// Location object constructor
function Location(data, query) {
  this.search_query = query;
  this.formatted_query = data.formatted_address;
  this.latitude = data.geometry.location.lat;
  this.longitude = data.geometry.location.lng;
}

// Forecast object constructor
function Forecast(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time*1000).toString().slice(0,15);
}

// Meetup event object constructor
function MeetupEvent(event) {
  this.link = event.link;
  this.name = event.name;
  this.creation_date = new Date(event.time).toString().slice(0, 15);
  this.host = event.group.name;
}
