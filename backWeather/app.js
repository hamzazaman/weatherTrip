const express = require('express')
const app = express()
var request = require("request")
const morgan = require('morgan')
const PORT = process.env.PORT || 5000
var polyline = require('@mapbox/polyline');
var cors = require('cors')

//desired time gap
const minStepDuration = 30 * 60

const darkSkyApiKey = ''


app.use(morgan('short'))
app.use(cors())

app.set('json spaces', 2);
var googleMaps = require('@google/maps').createClient({
    key: '',
    Promise: Promise
});

function timeConverter(UNIX_timestamp) {
    var a = new Date(UNIX_timestamp * 1000);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var year = a.getFullYear();
    var month = months[a.getMonth()];
    var date = a.getDate();
    var hour = a.getHours();
    var min = a.getMinutes();
    var sec = a.getSeconds();
    var time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec;
    return time;
}

var log = false

function getCurrentWeather(lat, long, time = null) {
    var url;
    if (time != null) {
        url = "https://api.darksky.net/forecast/" + darkSkyApiKey + "/" + lat + "," + long + "," + time + "?exclude=minutely,hourly,daily&units=si";
    } else {
        url = "https://api.darksky.net/forecast/" + darkSkyApiKey + "/" + lat + "," + long + "?exclude=minutely,hourly,daily&units=si";
    }
    return new Promise(function(resolve, reject) {
        request({
            url: url,
            json: true
        }, function(error, response, body) {
            if (!error && response.statusCode === 200) {
                if (log) {
                    console.log(body)
                    log = false
                }
                var data = {
                    "timezone": body.timezone,
                    'summary': body.currently.summary,
                    'temp': body.currently.temperature,
                    'icon': body.currently.icon,
                    'precipProbability': body.currently.precipProbability,
                    'precipIntensity': body.currently.precipIntensity,
                    "windSpeed": body.currently.windSpeed,
                    "visibility": body.currently.visibility,
                }
                data.alerts = body.alerts
                resolve(data);
            } else {
                reject(error);
            }
        });
    });
}

app.get('/', (req, res) => {
    console.log('I am root')
    res.send("Nothing Here")
})

app.get('/dir/:start/:dest/:time?', async (req, res) => {
    var array
    var now
    if(req.params.time) {
        now = parseInt(req.params.time)
    } else {
        now = Math.round((new Date().getTime()) / 1000);
    }
    //console.log(now)
    
    if(req.query.array) {
        array = req.query.array
        if(typeof array == "string") { //Wrap string in array if only one element is passed
            array = [array]
        }
        totalStops = []
        polylines = []
        //console.log(array)
        
        //Generate callbacks to allow for each trip to use last trips end time
        var callback = (newNow) => {
            getStops(array[array.length - 1], req.params.dest, newNow, (stops, poly) => {
                totalStops =  totalStops.concat(stops)
                polylines.push(poly)
                res.json({"stops" : totalStops, "polyline" : polylines})
            })
        }
        for (var i = array.length - 1; i > 0 ; i--) {
            var thisCallback = callback
            var index = i
            callback = (newNow) => {
                getStops(array[index - 1], array[index], newNow, (stops, poly) => {
                    var last = stops.pop()
                    totalStops =  totalStops.concat(stops)
                    polylines.push(poly)
                    thisCallback(last.unixTime)
                })
            }
        }
        
        getStops(req.params.start, array[0], now, (stops, poly) => {
            var last = stops.pop()
            totalStops =  totalStops.concat(stops)
            polylines.push(poly)
            callback(last.unixTime)
        })
    } else {
        var start = req.params.start
        var dest = req.params.dest

        getStops(start, dest, now, (stops, polyline) => {
            res.json({"stops" : stops, "polyline" : [polyline]});
        })
    }
    
})

async function getStops (start, dest, now, callback) {
    console.log("start: " +  start + " dest: " + dest + " time: " + now)
    googleMaps.directions({
        origin: start,
        destination: dest,
        departure_time: now,
        mode: 'driving',
    }, async (err, response) => {
        if (!err) {
            //generate Points based on desired time gap and polyline from google maps
            var line = polyline.decode(response.json.routes[0].overview_polyline.points)
            var poly = {"MVC" : response.json.routes[0].overview_polyline.points}
            var legs = response.json.routes[0].legs
            var length = 0
            for (var leg in legs) {
                length += (legs[leg].duration.value)
            }
            var points = []
            var numsteps = Math.ceil(length / minStepDuration)
            
            var stops = [];
            var alerts = [];
            var durations = []
            var addresses = []
            
            
            if (numsteps > 0) {
                for (var i = 0; i < numsteps; i++) {
                    points.push(line[Math.floor(line.length / numsteps) * i])
                }
                points.push(line[line.length - 1])
                
                await googleMaps.distanceMatrix({
                    origins: [points[0]],
                    destinations: points,
                    departure_time: now,
                    mode: 'driving',
                    traffic_model: 'best_guess'
                })
                .asPromise()
                .then((response) => {
                    durations = response.json.rows[0].elements
                    adresses = response.json.destination_addresses
                })
                
                //Generate stops from points and maps data
                for (var i = 0; i < numsteps + 1; i++) {
                    stops[i] = {
                        "lat": points[i][0],
                        "lng": points[i][1]
                    }
                    stops[i].unixTime = durations[i].duration_in_traffic.value + now
                    stops[i].duration = durations[i].duration_in_traffic.value
                    stops[i].address = adresses[i]
                    if (i > 0) {
                        stops[i].duration -= durations[i - 1].duration_in_traffic.value
                    }
                    stops[i].time = timeConverter(stops[i].unixTime)
                }
            } else {
                points = [line[0]]
                stops[0] = {"lat": points[0][0],
                            "lng": points[0][1]}
                stops[0].unixTime = now
                stops[0].duration = 0
                stops[0].time = timeConverter(stops[0].unixTime)
            }
            

            //Get weather and geo data for each stop
            await Promise.all(stops.map(async (stop) => {
                const data = await getCurrentWeather(stop.lat, stop.lng, time = stop.unixTime).catch(err => console.log(err));
                for (var k in data) {
                    stop[k] = data[k]
                }
                
                await googleMaps.reverseGeocode({
                    latlng: [stop.lat, stop.lng]
                })
                .asPromise()
                .then((response) => {
                    var comps = response.json.results[0].address_components
                    comps.forEach((element) => {
                        if (element.types[0] == "locality") {
                            stop.city = element.long_name
                            //console.log(stop.city)
                        }
                        if (element.types[0] == "administrative_area_level_1") {
                            stop.state = element.long_name
                        }
                        if (element.types[0] == "country") {
                            stop.country = element.long_name
                        }
                    })
                })
                .catch((err) => {
                    console.log(err);
                })
                
                
                
                //Get alerts per city
                var cityAlerts = (await getCurrentWeather(stop.lat, stop.lng).catch(err => console.log(err))).alerts
                if (cityAlerts) {
                    stop.alerts = []
                    for (var i = 0; i < cityAlerts.length; i++) {
                        stop.alerts[i] = cityAlerts[i]
                    }
                }

                return stop;
            })).then(() => {
                callback(stops, poly)
            });
            
            
        }
    })
}

app.listen(PORT, () => {
    console.log("server up")
})