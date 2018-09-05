var skycons = new Skycons({
    "color": "black"
});
var farenheit = false
var geo = null
var numStops = 0
var maxStops = 3

function switchDegree(){
    farenheit = !farenheit
    if (farenheit) {
        $("#degree").html('°F')
        $("cel").css("display", "none")
        $("far").css("display", "inline")
    } else {
        $("#degree").html('°C')
        $("far").css("display", "none")
        $("cel").css("display", "inline")
    }
}

function setupAccordion() {
    var acc = document.getElementsByClassName("accordion");
    var i;
    for (i = 0; i < acc.length; i++) {
        acc[i].addEventListener("click", function() {
            this.classList.toggle("active");
            var panel = this.nextElementSibling;
            if (panel.style.maxHeight) {
                panel.style.maxHeight = null;
            } else {
                panel.style.maxHeight = panel.scrollHeight + "px";
            }
        });
    }
}

function loadContent() {
    $('.results').hide()
    $('.load').html('<div class="loader"></div>')
    
    var start = $("#start").val().split(' ').join('+');
    var end = $("#end").val().split(' ').join('+');
    
    if($("#start").val() == "Your Location") {
        if (geo) {
            start = geo
        } else {
            $('.results').html('<h2>Sorry, Something went wrong!</h2><p>Seems like we weren\'t able to get your location.</p>')
            $('.load').html("")
            $('.results').show()
            return;
        }
    }
    
    if (!end) {
        end = start
    }
    if (!start) {
        start = end
    }
    var url = "https://road-weather.herokuapp.com/dir/" + start + "/" + end
    var inABit = moment().unix() + 30
    if (inABit < $('#datetimepicker1').datetimepicker('viewDate').unix()) {
        url += "/" + $('#datetimepicker1').datetimepicker('viewDate').unix()
    }
    var first = true
    $(".waypoint").each((i, obj) => {
        if($(obj).val() != "") {
            var stop = $(obj).val().split(' ').join('+');
            if(first) {
                url += "?array=" + stop
                first = false
            } else {
                url += "&array=" + stop
            }
        }
        
    })
    console.log(url)
    $.ajax({
        url: url,
        dataType: 'json',
        success: function(data) {
            var stops = data.stops
            $('.results').html('')
            for (var i = 0; i < stops.length; i++) {
                var stop = stops[i]
                var location
                if (stop.city) {
                    location = stop.city
                } else if (stop.state) {
                    location = stop.state
                } else {
                    location = stop.country
                }

                var momentTime = moment(stop.unixTime * 1000).tz(stop.timezone)
                var content = stop.summary +
                    '<br/> Precipitation: ' + (stop.precipProbability * 100) + "%" +
                    '<br />' + momentTime.format("h:mm a z, MMMM Do YYYY")
                if (stop.address) {
                    content += '<br />' + stop.address
                }

                if (stop.alerts) {
                    for (var j = 0; j < stop.alerts.length; j++) {
                        console.log("alerting")
                        var a = stop.alerts[j];
                        content += '<br /> <p class = "alertInfo"><u>Alert:</u> ' + a.title +
                            '<br /><u>Description:</u> ' + a.description +
                            '<br /><a target="_blank" class = "info" href=' + a.uri + '>More Info</a> ' +
                            '</p>'
                    }
                }

                var temp = '<cel>' + Math.round(stop.temp) + '°C' + '</cel><far>' + Math.round(stop.temp * 1.8 + 32) + '°F' + '</far>'

                var top = '<canvas class = "icon" id="icon' + i + '" width="28" height="28"></canvas>' + location + ', ' +
                    temp

                if (stop.alerts) {
                    top += '<icon class= "alert">⚠</icon>'
                }


                $('.results').append('<div class="card"><button class="btn accordion labels">' +
                    top +
                    '</button><div class="panel"><p>' +
                    content +
                    '</p></div></div>')
                skycons.add("icon" + i, stop.icon);

                switchDegree()
            }
            setupAccordion()
            skycons.play();
            $('.load').html("")
            $('.results').show()
        },
        error: function(data) {
            console.log('ERROR: ', data);
            $('.results').html('<h2>Sorry, Something went wrong!</h2><p>Make sure your entries are valid locations. </p>')
            $('.load').html("")
            $('.results').show()
        }
    });

}

function updateAddIcon() {
    if (numStops < maxStops) {
        $("#add-icon").css("color", "#495057")
    } else {
        $("#add-icon").css("color", "lightgrey")
    }
}

$(function() {
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            geo = position.coords.latitude + "," + position.coords.longitude
            $("#start").val("Your Location")
        })
    } 
    
    $(function() {
        $('#datetimepicker1').datetimepicker({
            minDate: moment().format(),
            defaultDate: moment().format(),
        });
    });
    $("#search").click(function() {
        loadContent()
    });

    $("#degree").click(function() {
        switchDegree()
    });
    
    let stopId = 1
    
    $("#add-stop").click(() => {
        if(numStops < maxStops) {
            numStops += 1
            let id = stopId
            stopId = stopId + 1
            $(".stops").append("<div style = 'margin-bottom : 8px; overflow: hidden; display: none;' id='stop-group" + id + "' class ='input-group' ><input class='form-control waypoint' type='text' placeholder= 'Add stop' id = 'stop" + id + "'><div class='input-group-append'><button style = 'background: WhiteSmoke;' class='input-group-text btn' id = 'minus-stop-" + id + "'><i class='fa fa-minus-circle'></i></button></div></div>")
            $("#stop-group"+id).slideDown("fast")
            $("#minus-stop-"+id).click(() => {
                //var thisGroup = group
                numStops -= 1
                //thisGroup.style.maxHeight = 0 + "px"
                $("#stop-group"+id).slideUp("fast", () => {$("#stop-group"+id).remove()})
                //$("#stop-group"+id).remove()
                updateAddIcon()
            })  
            updateAddIcon()
        }
    })

    $("#start").keyup(function(event) {
        if (event.keyCode === 13) {
            $("#end").focus();
        }
    });

    $("#end").keyup(function(event) {
        if (event.keyCode === 13) {
            $("#search").click();
            $("#end").blur()
        }
    });
});