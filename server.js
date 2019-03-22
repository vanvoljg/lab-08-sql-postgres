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
app.get('/location', getLocation);
app.get('/weather', getWeather);
app.get('/meetups', getMeetups);
app.get('/yelp', getYelps);
app.get('/movies', getMovies);
app.get('/trails', getTrails);

// '*' route for invalid endpoints
// app.use('*', (req, res) => res.send('Sorry, that route does not exist'));

app.listen(PORT, () => console.log(`Listening on PORT ${PORT}`));

function handleError(err, res) {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}

// HELPER FUNCTIONS

function getLocation(req, res) {
  let query = req.query.data;

  let sql = `SELECT * FROM locations WHERE search_query=$1;`;
  let values = [query];

  client.query(sql, values)
    .then( result => {

      if (result.rowCount > 0) {
        console.log('LOCATION FROM SQL');
        res.send(result.rows[0]);
      } else {

        const url = `https://maps.googleapis.com/maps/api/geocode/json?key=${process.env.GOOGLE_MAPS_API_KEY}&address=${req.query.data}`;
        superagent.get(url)
          .then(data => {
            console.log('LOCATION FROM API');

            if (!data.body.results.length) throw 'NO DATA';
            else {
              let location = new Location(query, data.body.results[0]);

              let newSql = `INSERT INTO locations(search_query, formatted_query, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING id;`;
              let newValues = Object.values(location);

              client.query(newSql, newValues)
                .then(result => {
                  location.id = result.rows[0].id;

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

function getWeather(req, res) {
  let query = req.query.data.id;
  let sql = `SELECT * FROM weathers WHERE location_id=$1;`;
  let values = [query];
  client.query(sql, values)
    .then(result => {
      if (result.rowCount > 0) {
        console.log('WEATHER RESULT FROM SQL');
        res.send(result.rows);
      } else {
        const url = `https://api.darksky.net/forecast/${process.env.DARK_SKY_API_KEY}/${req.query.data.latitude},${req.query.data.longitude}`;
        superagent.get(url)
          .then(weatherResults => {
            console.log('WEATHER FROM API');
            if (!weatherResults.body.daily.data.length) throw 'NO DATA';
            else {
              const weatherSummaries = weatherResults.body.daily.data.map(day => {
                let summary = new Forecast(day);
                summary.location_id = query;
                
                let newSql = `INSERT INTO weathers(forecast,time,location_id) VALUES($1, $2, $3);`;
                let newValues = Object.values(summary);

                client.query(newSql, newValues);
                return summary;
              });
              res.send(weatherSummaries);
            }
          })
          .catch(error => handleError(error, res));
      }
    });
}

// Forecast object constructor
function Forecast(day) {
  this.forecast = day.summary;
  this.time = new Date(day.time*1000).toString().slice(0,15);
}

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

function getYelps(req, res){
  let query = req.query.data.id;
  let sql = `SELECT * FROM yelps WHERE location_id=$1;`;
  let values = [query];

  client.query(sql, values)
    .then(result => {
      if (result.rowCount > 0) {
        console.log('YELP RESULT FROM SQL');
        res.send(result.rows);
      } else {
        const url=`https://api.yelp.com/v3/businesses/search?latitude=${req.query.data.latitude}&longitude=${req.query.data.longitude}`;

        superagent.get(url)
          .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
          .then(yelpResults => {
            console.log('YELP FROM API');
            if (!yelpResults.body.businesses.length) throw 'NO YELP DATA';
            else {
              const yelpArray = yelpResults.body.businesses.map(business => {
                let yelp = new Yelp(business);
                yelp.location_id = query;

                let newSql = `INSERT INTO yelps(url, name, rating, price, image_url, location_id) VALUES($1, $2, $3, $4, $5, $6) RETURNING id;`;
                let newValues = Object.values(yelp);

                client.query(newSql, newValues);
                return yelp;
              });
              res.send(yelpArray);
            }
          })
          .catch(error => handleError(error, res));
      }
    });
}

function Yelp(business) {
  this.url = business.url;
  this.name = business.name;
  this.rating = business.rating;
  this.price = business.price;
  this.image_url = business.image_url
}

function getMovies(req, res) {
  let query = req.query.data.id;
  let sql = `SELECT * FROM movies WHERE location_id=$1;`;
  let values = [query];
  client.query(sql, values)
    .then(result => {
      if (result.rowCount > 0) {
        console.log('MOVIES RESULT FROM SQL');
        res.send(result.rows);
      } else {

        let configUrl = `https://api.themoviedb.org/3/configuration?api_key=${process.env.MOVIEDBV3_API_KEY}`;
        let imgUrlBase;

        superagent.get(configUrl)
          .then(configResult => {
            console.log('MOVIES IMAGE URL BASE FROM API');
            if (!configResult.body.images) throw 'NO CONFIG DATA';
            else imgUrlBase = configResult.body.images.secure_base_url + configResult.body.images.poster_sizes[3];
          })
          .catch(error => handleError(error));        

        let url = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIEDBV3_API_KEY}&language=en-US&query=${req.query.data.search_query}`;

        superagent.get(url)
          .then(moviesResults => {
            console.log('MOVIES FROM API');
            if (!moviesResults.body.results.length) throw 'NO MOVIES DATA';
            else {
              const moviesArray = moviesResults.body.results.map(movieResult => {
                let movie = new Movie(movieResult, imgUrlBase);
                movie.location_id = query;

                let newSql = `INSERT INTO movies(title, released_on, total_votes, average_votes, popularity, image_url, overview, location_id) VALUES($1, $2, $3, $4, $5, $6, $7, $8);`;
                let newValues = Object.values(movie);

                client.query(newSql, newValues);
                return movie;
              });
              res.send(moviesArray);
            }
          })
          .catch(error => handleError(error));
      }
    });
}

function Movie(movieResult, imgUrlBase) {
  this.title = movieResult.title;
  this.released_on = movieResult.release_date;
  this.total_votes = movieResult.vote_count;
  this.average_votes = movieResult.vote_average;
  this.popularity = movieResult.popularity;
  this.image_url = imgUrlBase + movieResult.poster_path;
  this.overview = movieResult.overview;
}


