var lang = 'en';
var country = 'ch';

const flagStyle = 'flat';
const flagSize = 64;

const TABLE_A = 0;
const TABLE_C = 1;
const TABLE_PENALTIES = 2;
const TABLE_OPTIMUM = 10;

let currentTableType = TABLE_A;
let twoPhaseGame = 0;
let isRealtime = false;
var _startlist;
var server_time = 0;
var client_time = 0; 

const labels = ["CLASSFIED", "NOT_PRESENT", "NOT_STARTED", "RETIRED", "ELIMINATED", "OFF_COURSE", "DISQUALIFIED"];
const headerClasses = {
    rnkClass: 'col-rank text-center px-02',
    numClass: 'col-rank text-center px-02',
    riderClass: 'w-50',
    horseClass: 'w-50',
    flagClass: 'col-nation px-0',
    pointsClass: 'col-point px-02 text-center font-13',
    timeClass: 'col-time px-02 text-center font-13'
};

const dataClasses = {
    rnkClass: 'col-rank text-center bg-color-macaroni text-color-black px-02',
    numClass: 'col-rank text-center bg-white text-color-black px-02',
    riderClass: 'w-50 col-rider',
    horseClass: 'w-50 col-horse',
    flagClass: 'col-nation px-02',
    pointsClass: 'col-point col-font-monospace text-right bg-color-perano text-color-black px-02 body',
    timeClass: 'col-time col-font-monospace text-right bg-color-pale-canary text-color-black px-02 body'
};

function localizedValue(key, lang) {
    const pack = localization[lang];
    if (!pack) { return key; }
    return pack[key] || key;
}

function localizeKey(key) {
    const elements = $(`[data-key="${key}"]`);
    const elementCount = elements.length;
    for (let i = 0; i < elementCount; i++) {
        $(elements[i]).html(localizedValue(key, lang));
    }
}

function localizeAll(lan) {
    lang = lan;
    const elements = $('[data-key]');
    const elementCount = elements.length;
    for (let i = 0; i < elementCount; i++) {
        key = $(elements[i]).attr('data-key');
        $(elements[i]).html(localizedValue(key, lan));
    }
}

function onEn() {
    lang = 'en';
    localizeAll(lang);
}

function onGe() {
    lang = 'ge';
    localizeAll(lang);
}

function onFr() {
    lang = 'fr';
    localizeAll(lang);
}

function onIt() {
    lang = 'it';
    localizeAll(lang);
}

$(function() {
    var FADETIMOUT = 2000;

    // running events
    var events = [];
    var curEvent = 0;

    // info of current event
    var startlist = []; // startlist
    var horses = {}; // indexed map
    var riders = {}; // indexed map
    var startlistmap = {}; // number indexed map
    var rankings = []; // ranking list
    var cc_rankings = []; // cc ranking list
    var gameInfo = {};
    var realtime = {}; // live info
    var finished = Array();
    var running = Array();

    var course_points = null;
    
    var players = {}; // player's info
    var sections = {} // section's player num list 
    var sync_time = 0;
    var prev_time = 0;
    var cur_back_counter = 0;


    var rolling_timer;
    var timer_running = false;
    var show_timer = true;

    var eventInfo = {}; // event.info

    // Prompt for setting a username
    var connected = false;
    var socket = io();

    setInterval(function () {
        
        if (!server_time) return;

        var t = server_time + Date.now() - client_time;
        var date = new Date(t);
        var hour    = date.getHours();
        var minute  = date.getMinutes();
        var seconds = date.getSeconds(); 
        var mils = parseInt(date.getMilliseconds() / 100);

        $('#now_time').html(("0" + hour).slice(-2) + ":" + ("0" + minute).slice(-2) + ":" + ("0" + seconds).slice(-2) + "." + mils);

        if (cur_back_counter == 0) {
            if ($('#start_list').css('display') == 'none') {
                $('#current_list_back').css({ top: $('#current_list').position().top + 5 });
                if ($('#current_body tr').length == 0) {
                    $('#current_list_back').css({height: "70px"});
                    $('.time-stop').hide();
                } else {
                    $('#current_list_back').css({height: "145px"});
                }    
            } else {
                const startlistRow = findRealtimeRow();
                
                if (Object.keys(startlistRow).length != 0) {
                    console.log(startlistRow.position().top);
                    $('#current_list_back').css({ top: startlistRow.offset().top + 1});
                    $('#current_list_back').css({height: startlistRow.height() - 1});
                } else {
                    $('#current_list_back').css({height: "0px"});
                }
            }

        }

        cur_back_counter ++;
        if (cur_back_counter > 5) cur_back_counter = 0;
        
    }, 100);

    socket.emit("subscribe", "consumer");
    //

    //// messages to process
    //   socket.to('consumer').emit('start', { id: event.id} );
    //   socket.to('consumer').emit('end', { id: socket.eventId });
    //   socket.to(event.id).emit('info', event.info);
    //   socket.to(event.id).emit('horses', event.horses);
    //   socket.to(event.id).emit('riders', event.riders);
    //   socket.to(event.id).emit('startlist', event.startlist);
    //   socket.to(event.id).emit('ranking', event.ranking);
    //   socket.to(event.id).emit('ready', event.realtime);
    //   socket.to(event.id).emit('resume');
    //   socket.to(event.id).emit('realtime', event.realtime);
    //   socket.to(event.id).emit('pause');
    //   socket.to(event.id).emit('final', event.realtime);

    // Socket events

    // get the current running events information
    socket.on("events", function(data) {
        console.log("[on] events:" + JSON.stringify(data));
        events = data;
        updateEventList();

        var url = new URL(location.href);
        
        var eventId = url.searchParams.get("eventid");
        var runId = url.searchParams.get("runid");
        var c = eventId + "_" + runId + '_2';       

        if (c != "") joinToEvent(c);
    });

    socket.on("live_info", function(data) {
        console.log("[on] live_info:" + JSON.stringify(data));

        players = data.players;
        sections = data.sections;


        finished = sections.finish.reverse();
        running = sections.live.reverse();
        
        updateLiveCurrent();
        updateLiveAtFinish();
        //setRuntimeList(true);
        updateStartList();
        updateLiveAtStart();
    });

    socket.on("CrossSYNC", function(data) {

        sync_time = parseInt(data.sync_time);

        if (data.course_points != undefined) {
            course_points = {}
            for (let entry of data.course_points) {
                course_points[entry.num] = entry.course_point;
            }
        }

        console.log(course_points);

        updateRuntimeTimer(sync_time);

        console.log(sync_time);
    });

    // add new event started
    socket.on("start", function(data) {
        console.log("[on] start:" + JSON.stringify(data));
        events.push(data);
        updateEventList();
    });

    // an event is ended
    socket.on("end", function(data) {
        console.log("[on] end:" + JSON.stringify(data));

        // stop timer
        //clearInterval(rolling_timer);
        timer_running = false;
        setRuntimeList(true);

        events = events.filter((event) => {
            return event.id !== data;
        });

        $('#error_finishevent').show();

        updateEventList();
    });

    // update event info
    socket.on("info", function(data) {
        console.log('event info', data);

        sync_time = 0;
        // set eventInfo
        eventInfo = data;
        server_time = eventInfo.server_time;
        client_time = Date.now();

        country = eventInfo.country.toLowerCase() || 'ch';

        // update UI
        $('#meeting-title').text(data.title);
        $('#event-title').text(data.eventTitle);

        $('#event-date').text(formatDate(data.eventDate));

        $('#scheduler-number').text(data.schedulerNumber);
        $('#category').text(data.category);
        $('#notes').text(data.notes);
        $('#height').text(data.height);
        $('#init-award-list-amount').text(data.initAwardListAmount);
        $('#event-time').text(data.eventTime);
        $('#event-date1').text(formatDate(data.eventDate));

        if (eventInfo.eventing) {
            $('#nav-ccranking').show();
        }
        
        // update headercolumns according to the race type
        updateTableHeaderColumns();

        rolling_timer = setInterval(function() {
            if (sync_time != 0) {
                if (prev_time == 0) {
                    prev_time = Date.now();
                    return;
                }

                let cur_time = Date.now();
                sync_time += cur_time - prev_time;
                prev_time = cur_time
                updateRuntimeTimer(sync_time);
            }
        }, 150);
    });

    // update horse info
    socket.on('horses', function(data) {
        console.log("[on] horses:" + data.length /* + JSON.stringify(data) */ );
        horses = {};
        for (let horse of data) {
            horses[horse.idx] = horse;
        }

        // update UI
        updateRankingList();
    });

    // update rider info
    socket.on('riders', function(data) {
        console.log("[on] riders:" + data.length /* + JSON.stringify(data) */ );
        riders = {};
        for (let rider of data) {
            riders[rider.idx] = rider;
        }

        // update UI
        updateRankingList();
    });

    // update startlist
    socket.on('startlist', function(data) {
        console.log("[on] startlist:" + data.length /* + JSON.stringify(data) */ );
        startlist = data;
        window.startlist = data
        // if(data.length > 60) {
            // $("#nav-seriesranking").show();
        // } else {
            $("#nav-seriesranking").hide();
        // }

        startlistmap = {};
        for (let startlistentry of data) {
            startlistmap[startlistentry.num] = startlistentry;
        }

        // updateUI
    });

    // update ranking info
    socket.on('ranking', function(data) {
        console.log("[on] ranking:" + data.ranking.length /* + JSON.stringify(data) */ );
        // move "labeled" to the bottom

        
        gameInfo = data.gameInfo;

        if (gameInfo == null) return;
        
        gameInfo.eventId = curEvent;
        currentTableType = gameInfo.table_type;
        twoPhaseGame = gameInfo.two_phase;
        rankings = data.ranking;
        updateGameInfo();
        for (let i = 1; i < rankings.length; i++) {
            let num = rankings[i][1];
            let startlistentry = startlistmap[num];
            if (startlistentry !== undefined) {
                const horseIdx = startlistentry.horse_idx;
                const riderIdx = startlistentry.rider_idx;
                const rider = riders[riderIdx];

                rankings[i][2] = horses[horseIdx].name || '';
                rankings[i][3] = rider ? `${rider.firstName} ${rider.lastName}` : '';
                rankings[i][4] = rider.nation || country;
            }
        }

        // Update UI`
        updateRankingList();
        updateStartList();

        
        if (!realtime || !realtime.num) {
            updateLiveAtStart();
        }

        if (!timer_running) {
            updateLiveAtFinish();
            setRuntimeListFinal();
        }
    });

    socket.on('cc-ranking', function(data) {
        console.log("[on] ranking:" + data.length /* + JSON.stringify(data) */ );
        // move "labeled" to the bottom
        cc_rankings = data;

        for (let i = 1; i < cc_rankings.length; i++) {

            try {
                let num = cc_rankings[i][1];
                const horseIdx = cc_rankings[i][2];
                const riderIdx = cc_rankings[i][3];
                const rider = riders[riderIdx];
    
                cc_rankings[i][2] = horses[horseIdx].name || '';
                cc_rankings[i][3] = rider ? `${rider.firstName} ${rider.lastName}` : '';
                cc_rankings[i][4] = rider.nation || country;
    
            } catch(e)
            {

            }
        }

        console.log(cc_rankings);

        // Update UI
        updateCCRankingList();
    });

    // one ready to race
    socket.on('ready', function(data) {
        console.log("[on] ready:");
        // find position
        let startlistentry = startlistmap[realtime.num];

        // update atstart and atend
        if (startlistentry !== undefined) {
            updateLiveAtStart(startlistentry['pos'] + 1);
            updateLiveAtFinish();
        }
        // init realtime and update
        setRuntimeList(true);
    });

    // get live race info
    socket.on('realtime', function(data) {
        realtime = data;
        realtime.updateTick = Date.now();
        isRealtime = true;
        // update except time
        setRuntimeList(false);

        if (timer_running == false) {
            let curTime;
            if (realtime.lane === 1) {
                curTime = realtime.score.lane1.time;
            } else {
                curTime = realtime.score.lane2.time;
            }
            updateRuntimeTimer(realtime.lane, curTime);
        }
    });

    // racing is started (every round)
    socket.on('resume', function(data) {
        console.log("[on] resume");

        // find position
        let startlistentry = startlistmap[realtime.num];

        // update atstart and atend
        if (startlistentry !== undefined) {
            updateLiveAtStart(startlistentry['pos'] + 1);
            updateLiveAtFinish();
        }

        // start rolling timer
        if (timer_running) {
            console.log("timer already running");
        } else {
            let started = 0,
                tickFrom = Date.now();
            if (realtime.lane === 1) {
                started = realtime.score.lane1.time;
            } else {
                started = realtime.score.lane2.time;
            }/*
            rolling_timer = setInterval(function() {
                
                if (Date.now() - tickFrom > 500) {
                    tickFrom = realtime.updateTick;
                    if (realtime.lane === 1) {
                        started = realtime.score.lane1.time;
                    } else {
                        started = realtime.score.lane2.time;
                    }
                } else {
                    show_timer = true;
                }
                updateRuntimeTimer(realtime.lane, started + (Date.now() - tickFrom));
                
            }, 100);*/

            timer_running = false;
        }
    });

    socket.on('connectedUserCount', function(data) {
        $("#connected-count1").html(data);
        $("#connected-count2").html(data);
    });

    // racing is paused (every round)
    socket.on('pause', function(data) {
        console.log("[on] pause");
        isRealtime = false;
        // stop rolling timer
        //clearInterval(rolling_timer);
        timer_running = false;

        // full update
        if (data.finished === true) {
            if (!finished.find(num => num === realtime.num)) {
                finished.push(realtime.num);
            }
            updateLiveAtFinish();
            setRuntimeList(true);
            updateStartList();
        } else {
            let started;
            if (realtime.lane === 1) {
                started = realtime.score.lane1.time;
            } else {
                started = realtime.score.lane2.time;
            }
            updateRuntimeTimer(realtime.lane, started);
        }

        setRuntimeListFinal();
    });

    // one player finished
    socket.on('final', function(data) {
        console.log("[on] final:" + JSON.stringify(data));
        isRealtime = false;
        // find position
        let startlistentry = startlistmap[realtime.num];

        // update atstart and atend
        if (startlistentry !== undefined) {
            updateLiveAtStart(startlistentry['pos'] + 1);
            updateLiveAtFinish();
        }

        // update runtime with ranking
        let ranking = rankings.find(function(ranking) {
            return ranking.num === realtime.num;
        });
        if (ranking !== undefined) {
            realtime.rank = ranking.rank;
        }
        setRuntimeListFinal();
        updateStartList();
    });

    socket.on('disconnect', function() {
        console.log('you have been disconnected');
    });

    socket.on('reconnect', function() {
        console.log('you have been reconnected');
        events = [];

        socket.emit("subscribe", "consumer");
    });

    socket.on('reconnect_error', function() {
        console.log('attempt to reconnect has failed');
    });


    ///////////////////////////////////////////////////
    // UI management function

    function convertSecondsToTime(seconds) {
        seconds = seconds / 1000
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 10000) / 60);
        const remainingSeconds = seconds % 60;
    
        // Format the time string
        return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    function updateGameInfo() {
        const allowedTimeLabel = (gameInfo && gameInfo.allowed_time) ? formatFloat(gameInfo.allowed_time / 1000, 2, 'floor') : '-';
        const allowedTimeJumpoff = (gameInfo && gameInfo.two_phase) ? formatFloat(gameInfo.allowed_time_jumpoff / 1000, 2, 'floor') : '-';

        $("#allowed_time_1").html(allowedTimeLabel);

        if (gameInfo && gameInfo.two_phase) {
            $("#allowed_time_2").html(allowedTimeJumpoff);
            $("#allowed_time_splitter").show();
            $("#allowed_time_2").show();
            $(".allowed-time-slot").width(240);
            $("#allowed_time_1").removeClass('w-100');
            $("#allowed_time_1").addClass('w-50');
        } else {
            $("#allowed_time_1").removeClass('w-50');
            $("#allowed_time_1").addClass('w-100');
            $("#allowed_time_2").hide();
            $("#allowed_time_splitter").hide();
            $(".allowed-time-slot").width(120);
        }



        $("#ranking_count").html(gameInfo.ranking_count);
        $("#registered_count").html(startlist.length);
        $("#started_count").html(gameInfo.started_count);
        $("#cleared_count").html(gameInfo.cleared_count);
        $("#comingup_count").html(startlist.length - gameInfo.started_count);
        $("#allowed_time_label").attr('data-key', gameInfo.table_type === TABLE_OPTIMUM ? 'TIME_OPTIMUM' : 'IDEAL_TIME');

        updateEventProgress();
    }

    function tickToTimeD(ticks, time_accuracy)
    {
        if (ticks == undefined || ticks == "")
            return "&nbsp;";

        var ts = ticks / 1000;

        var mils = 0;
        

        if (time_accuracy >= 2 && time_accuracy <= 5)
            mils = Math.floor((ticks % 1000) / Math.pow(10, 5 - time_accuracy));
        else
            mils = Math.floor((ticks % 1000) / 100);

        //conversion based on seconds
        var hh = Math.floor( ts / 3600);
        var mm = Math.floor( (ts % 3600) / 60);
        var ss = Math.floor((ts % 3600) % 60);

        //prepend '0' when needed
        hh = hh < 10 ? '0' + hh : hh;
        mm = mm < 10 ? '0' + mm : mm;
        ss = ss < 10 ? '0' + ss : ss;

        //use it
        //var str = hh + "h" + mm + ":" + ss;
        var str = hh + ":" + mm + ":" + ss;

        if (5 - time_accuracy != 3)
            str += "." + mils;

        str = str.replace(/^0([1-9]?:.+)/gi, "$1");
        str = str.replace(/^00:(.+)/gi, "$1"); 

        str = str.replace(/^0([1-9]?:.+)/gi, "$1");
        str = str.replace(/^00:(.+)/gi, "$1"); 

        str = str.replace(/^0([1-9]?\..+)/gi, "$1");
        str = str.replace(/^0(0\..+)/gi, "$1");

        return str;
    }

    function formatFloat(point, digit, round) {
        point = point || 0;
        digit = (digit > 5) ? 5 : digit;
        digit = (digit < 0) ? 0 : digit;

        let pos = Math.pow(10, digit);
        if (round === 'round') {
            point = Math.round(point * pos);
        } else if (round === 'ceil') {
            point = Math.ceil(point * pos);
        } else if (round === 'floor') {
            point = Math.floor(point * pos);
        }
        return (point / pos).toFixed(digit);
    }

    function formatPoint(score, detail) {
        if (score.point === undefined)
            return "&nbsp";

        if (score.point === undefined)
            return "&nbsp";

        if (score.point < 0) {
            let index = Math.abs(score.point) - 1;
            if (index > 0 && index <= 6) {
                return `<span class="point-label" data-key="${labels[index]}">${labels[index]}</span>`;
            }
            if (index == 7) return "&nbsp;"
        }

        let label = formatFloat(score.point / 1000, 2, 'floor');
        if (detail && (score.pointPenalty !== undefined && score.pointPenalty != 0)) {
            label += "<span class=\"text-small\">(+" + formatFloat(score.pointPenalty / 1000, 2, 'floor') + ")</span>";
        }

        if (currentTableType === TABLE_C) {
            if (score.point === 0) {
                return '<span></span>';
            } else {
                return `(${label})`;
            }
        }

        return label;
    }
    function tickToTimeD(ticks, time_accuracy)
    {
        if (ticks == undefined || ticks == "")
            return "&nbsp;";

        var ts = ticks / 1000;

        var mils = 0;
        

        if (time_accuracy >= 2 && time_accuracy <= 5)
            mils = Math.floor((ticks % 1000) / Math.pow(10, 5 - time_accuracy));
        else
            mils = Math.floor((ticks % 1000) / 100);

        //conversion based on seconds
        var hh = Math.floor( ts / 3600);
        var mm = Math.floor( (ts % 3600) / 60);
        var ss = Math.floor((ts % 3600) % 60);

        //prepend '0' when needed
        hh = hh < 10 ? '0' + hh : hh;
        mm = mm < 10 ? '0' + mm : mm;
        ss = ss < 10 ? '0' + ss : ss;

        //use it
        //var str = hh + "h" + mm + ":" + ss;
        var str = hh + ":" + mm + ":" + ss;

        if (5 - time_accuracy != 3)
            str += "." + mils;

        str = str.replace(/^0([1-9]?:.+)/gi, "$1");
        str = str.replace(/^00:(.+)/gi, "$1"); 

        str = str.replace(/^0([1-9]?:.+)/gi, "$1");
        str = str.replace(/^00:(.+)/gi, "$1"); 

        str = str.replace(/^0([1-9]?\..+)/gi, "$1");
        str = str.replace(/^0(0\..+)/gi, "$1");

        return str;
    }
    function formatTime(score, detail) {
        if (score.time === undefined)
            return "&nbsp";

        let label = formatFloat(Math.abs(score.time) / 1000, 2, 'floor');
        if (detail && (score.timePenalty !== undefined && score.timePenalty != 0)) {
            label += "(+" + formatFloat(Math.abs(score.timePenalty) / 1000, 2, 'floor') + ")";
        }
        return label;
    }

    function formatDate(dateString) {
        var d = new Date(dateString.replace(/\s/, 'T'));

        return ("0" + d.getDate()).slice(-2) + "." + ("0" + (d.getMonth() + 1)).slice(-2) + "." + d.getFullYear();
    }

    function formatSimpleTime(date) {
        return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
    }

    function updateTableHeaderColumns() {
        // change header
        let headers = $(".table-scoreboard thead tr");

        if (eventInfo.jumpoffNumber > 0) {
            headers.children("th:nth-child(6)").addClass("small-font");
            headers.children("th:nth-child(7)").addClass("small-font");
            headers.children("th:nth-child(8)").addClass("small-font");
        } else {
            headers.children("th:nth-child(6)").removeClass("small-font");
            headers.children("th:nth-child(7)").removeClass("small-font");
            headers.children("th:nth-child(8)").removeClass("small-font");
        }

        // realtime
        var tr = $('#live-realtime tr:first');

        if (eventInfo.jumpoffNumber > 0) {
            tr.children("td:nth-child(6)");
            tr.children("td:nth-child(7)");
            tr.children("td:nth-child(8)");
        } else {
            tr.children("td:nth-child(6)");
            tr.children("td:nth-child(7)");
            tr.children("td:nth-child(8)");
        }
    }

    //  fill the list from index to the atstart list
    function updateLiveAtStart() {

        
        if (sections.start == undefined || sections.start[0] == undefined) {
            $("#nextriders_body").html('');
            return;
        }

        /*
        const jumpoff = eventInfo.jumpoff;
        const roundCount = eventInfo.roundNumber;
        const l = index - 1;
        index = 0;
        const filtered = startlist.filter((r, i) => {
            const num = r.num;
            const ranking = rankings.find(r2 => r2[1] === num);
            if (jumpoff) {
                if (!ranking) { return false; }
                const point = parseFloat(ranking[5 + (roundCount - 1) * 2]);
                const time = parseFloat(ranking[5 + (roundCount - 1) * 2 + 1]);
                if (point !== 0 || time === 0) { return false; }
            }
            if (i < l) {
                index++;
            }
            return true;
        });

        let limit = (index + 3 < filtered.length) ? (index + 3) : filtered.length;

        const table = [];
        if (rankings.length >= 1) {
            table[0] = rankings[0];
        }
        let j = 1;
        for (i = limit - 1; i >= index; i--) {
            const startlistentry = filtered[i];
            const num = startlistentry.num;
            const ranking = rankings.find(r => r[1] === num);
            table[j] = ranking;
            if (!ranking) {
                const horse = horses[startlistentry.horse_idx];
                const rider = riders[startlistentry.rider_idx];
                const data = Array(rankings[0].length).fill('');
                data[0] = num;
                data[1] = num;
                data[2] = `${horse.name}`;
                data[3] = `${rider.firstName} ${rider.lastName}`;
                table[j] = data;
            }
            j += 1;
        }
        */

        //try {
            let filtered = sections.start.slice(0, 3).reverse();
            const table = [];

            for (i = 0; i < 3; i++) {

                let startlistentry = startlist.find((entry) => {
                    return (entry.num == filtered[i]);
                });

                if (!startlistentry) continue;
                const num = startlistentry.num;
                const ranking = rankings.find(r => r[1] === num);
                table[i + 1] = ranking;
                if(!ranking){
                    const horse = horses[startlistentry.horse_idx];
                    const rider = riders[startlistentry.rider_idx];
                    const data = Array(rankings[0].length).fill('');
                    data[0] = num;
                    data[1] = num;
                    data[2] = `${horse.name}`;
                    data[3] = `${rider.firstName} ${rider.lastName}`;
                    table[i + 1] = data;
                }
            }
    
            updateTable("nextriders", table);
            localizeAll(lang);
                
        //} catch (error) {
            
        //}
    }

    // fill the rank from index to the atstart list
    function updateLiveAtFinish() {
        const len = finished.length;
        const table = [];

        if (rankings.length >= 1) {
            table[0] = rankings[0];
        }
        let j = 1;
        for (let i = len - 1; i >= Math.max(0, len - 3); i--) {
            let num = finished[i];
            let ranking = rankings.find(r => r[1] === num);
            table[j] = ranking;
            j += 1;
        }
        updateTable("finish", table);
        localizeAll(lang);
    }

    function updateLiveCurrent() {

        $("#current_body").html('');

        for (let i = 0; i < running.length; i ++) {
            let live_idx = i;
            let live_num = running[i];

            setRuntimeList(false, live_idx, live_num);
        }
        
        
        localizeAll(lang);
    }

    function updateRuntimeTimer() { //lane, value
        /*
        const diff = Date.now() - realtime.updateTick;
        if (diff >= 300) {
            show_timer = false;
        } else {
            show_timer = true;
        }
        let label = formatFloat(Math.abs(value) / 1000, 1, 'floor');
        if (!show_timer) { label = ''; }

        const jumpoffNumber = eventInfo.jumpoffNumber;
        const roundNumber = eventInfo.roundNumber;
        country = eventInfo.country.toLowerCase();
        const round = eventInfo.round;
        const jumpoff = eventInfo.jumpoff;
        let offset = round ? round : (jumpoff + roundNumber);
        const score = round ? realtime.score.lane1 : realtime.score.lane2;

        //let ranking = rankings.find(r => r[1] === realtime.num);
        //if (ranking && ranking[6] != "") offset = 2;

        const currentBody = $('#current_body');
        const tr = $(currentBody.children(0));
        tr.children(`td:nth-child(${5 + twoPhaseGame * (lane - 1) * 2 + (offset - 1) * 2 + 2})`).html(label);
        if (isRealtime) {
            updateStartlistRowRealtimeTime(label, 5 + twoPhaseGame * (lane - 1) * 2 + (offset - 1) * 2 + 2);
        }
        localizeAll(lang);
        */

        if (sync_time == 0) return;

        //updateLiveAtStart();

        const currentBody = $('#current_body');

        for (let i = 1; i <= currentBody.children().length; i ++) {

            const tr = currentBody.children("tr:nth-child(" + i + ")");

            let num = tr.children("td:nth-child(2)").html();

            //console.log(players[num]);


            let start_time = 0;

            if (players && players[num] && players[num].start_time) {
                start_time = players[num].start_time;
            } else {
                let start_entry = startlist.find((start_entry) => {
                    return (start_entry.num == num);
                });

                if (start_entry) {
                    start_time = start_entry.start_time;                
                }
            }

            let passing_time = sync_time - parseInt(start_time);

            let time_str = "";
            let point_str = "0.00";

            if (passing_time > 0) {
                time_str = tickToTimeD(passing_time);
                tr.children("td:nth-child(7)").html(time_str); //
            } else {
                tr.children("td:nth-child(7)").html("");
            }

            let crossOptimumTime = parseInt(eventInfo.crossOptimumTime);

            let points = 0;

            if (course_points != null && course_points != undefined) {
                points += parseInt(course_points[num]);
            }

            if (passing_time > crossOptimumTime && crossOptimumTime != 0) {

                let crossSurpassingBaseTime = parseInt(eventInfo.crossSurpassingBaseTime);
                let crossSurpassingPoints = parseInt(eventInfo.crossSurpassingPoints);

                points = crossSurpassingPoints * Math.floor((passing_time - crossOptimumTime) / crossSurpassingBaseTime);

            }

            
            point_str = formatPoint({point: points});
            if (point_str == "") point_str = "0.00";
             // parseInt(points / 100) / 10 points 
             
            tr.children("td:nth-child(6)").html(point_str);
            let start_tr = $("#startlist_" + num);
            start_tr.children("td:nth-child(7)").html(time_str);
            start_tr.children("td:nth-child(6)").html(point_str);
        }
        
    }

    function setRuntimeListFinal() {
        const currentBody = $("#current_body");
        if (!currentBody.children().length) {
            return;
        }
        let currentRiderData = rankings.find(r => r[1] === realtime.num);
        if (!currentRiderData) {
            return;
        }
        $("#current_body").html('');
        addRow(currentRiderData, currentBody, true, dataClasses);
        localizeAll(lang);
    }

    function setRuntimeList(fullupdate, live_idx, live_num, score) {
        // clear content
        /*
        if (realtime.num == 0 || startlistmap[realtime.num] === undefined) {
            $("#current_body").html('');
            return;
        }*/

        const currentBody = $("#current_body");
        /*
        if (currentBody.children().length) {
            $("#current_body").html('');
        }*/

        const startlistentry = startlistmap[live_num];
        const horse = horses[startlistentry.horse_idx];
        const rider = riders[startlistentry.rider_idx];

        let currentRider = $(currentBody.children()[live_idx]);
        if (currentRider) {
            let data = rankings.find(r => r[1] === live_num);
            const currentRiderData = data || rankings[0];
            currentRiderData[2] = horse.name;
            currentRiderData[3] = `${rider.firstName} ${rider.lastName}`;
            if (!data) {
                const l = currentRiderData.length;
                for (let i = 4; i < l; i++) {
                    currentRiderData[i] = '';
                }
            }
            currentRider = addRow(currentRiderData, currentBody, true, dataClasses);
        }



        currentRider.children("td:nth-child(1)").html((realtime.rank === undefined) ? "&nbsp" : realtime.rank + ".");
        currentRider.children("td:nth-child(2)").html(live_num);
        //currentRider.children(`td:nth-child(6)`).html(formatPoint(score, false));
        if (fullupdate === true) {
            currentRider.children(`td:nth-child(7`).html(formatTime(score, false));
        }

        if (horse !== undefined) {
            currentRider.children("td:nth-child(3)").html(`<span>${horse.name}</span>`);
        } else {
            currentRider.children("td:nth-child(3)").html("&nbsp");
        }
        currentRider.children("td:nth-child(3)").addClass("bg-white text-color-black");

        if (rider !== undefined) {
            currentRider.children("td:nth-child(4)").html(`<span>${rider.firstName} ${rider.lastName}</span>`);
            const nation = rider.nation || country;
            const url = `/flags/${nation}.bmp`;
            currentRider.children("td:nth-child(5)").css("background", `#232323 url('${url}') center no-repeat`).css("background-size", "contain");
            currentRider.children("td:nth-child(5)").attr("data-toggle", "tooltip").attr("title", nation);
        } else {
            currentRider.children("td:nth-child(4)").html("&nbsp");
            // currentRider.children("td:nth-child(5)").html("&nbsp");
        }
        currentRider.children("td:nth-child(4)").addClass("bg-white text-color-black");
        
        /*
        setTimeout(() => {
            if (isRealtime) {
                updateStartlistRealtimePoint(score, 5 + twoPhaseGame * (realtime.lane - 1) * 2 + (offset - 1) * 2 + 1);
            }
        }, 10);
        */
        //localizeAll(lang);
    }

    function findRealtimeRow() {
        _startlist = startlist;
        const startlistBody = $("#startlist_body");

        const jumpoff = eventInfo.jumpoff;
        const roundCount = eventInfo.roundNumber;
        const startListCount = startlist.length;
        let index = 0;
        for (let i = 0; i < startListCount; i++) {
            const r = startlist[i];
            const num = r.num;
            const ranking = rankings.find(r2 => r2[1] === num);
            if (jumpoff) {
                if (!ranking) { continue; }
                const point = parseFloat(ranking[5 + (roundCount - 1) * 2]);
                const time = parseFloat(ranking[5 + (roundCount - 1) * 2 + 1]);
                if (point !== 0 || time === 0) { continue; }
            }
            if (num === realtime.num) {
                break;
            }
            index++;
        }
        return $(startlistBody.children()[index]);
    }

    function updateStartlistRealtimePoint(score, offset) {
        const startlistRow = findRealtimeRow();
        startlistRow.children(`td:nth-child(${offset})`).html(formatPoint(score, false));
        localizeAll(lang);
    }

    function updateStartlistRowRealtimeTime(label, offset) {
        const startlistRow = findRealtimeRow();
        startlistRow.children(`td:nth-child(${offset})`).html(label);
        localizeAll(lang);
    }

    function updateStartList() {
        if ($.isEmptyObject(horses) || $.isEmptyObject(riders)) {
            return;
        }
        const tbody = $("#startlist_body");
        tbody.html('');
        const colCount = rankings.length ? rankings[0].length : 7;
        const jumpoff = eventInfo.jumpoff;
        const roundCount = eventInfo.roundNumber;
        startlist.forEach(r => {
            const num = r.num;
            const ranking = rankings.find(r2 => r2[1] === num);
            if (jumpoff) {
                if (!ranking) { return; }
                const point = parseFloat(ranking[5 + (roundCount - 1) * 2]);
                const time = parseFloat(ranking[5 + (roundCount - 1) * 2 + 1]);
                if (point !== 0 || time === 0) { return; }
            }
            const row = Array(colCount).fill('');
            const rider = riders[r.rider_idx];
            const horse = horses[r.horse_idx];
            if (!ranking) {
                row[0] = '';
                row[1] = num; // rank
                row[2] = horse.name;
                row[3] = `${rider.firstName} ${rider.lastName}`;
                row[4] = rider.nation || country;

                let start_entry = startlist.find(start_entry => start_entry.num == num);

                if (start_entry) {
                    row[6] = start_entry.start_time;                
                }

                 
            } else {
                row[5] = 0;
                // ranking[6] = r.start_time;
                if(r.start_time == 0){
                    row[6] = '';
                }else
                row[6] = convertSecondsToTime(r.start_time);
            }
            let id = "startlist_" + num;
            addRow(ranking || row, tbody, true, dataClasses, horse, rider, true, false, id);
        });
        localizeAll(lang);
    }
    function updateRankingList() {
        if (rankings.length >= 1) {
            updateHeaders(rankings[0]);
        }        
        
        let seriesranking1 = [];
        let seriesranking2 = [];
        // seriesranking1.push(rankings[0]);
        // seriesranking2.push(rankings[0]);
        // for(let i = 1; i < rankings.length; i++) {
        //     let ranking = rankings[i]
        //     ranking[0] = Math.floor((rankings[i][0] + 1) / 2)
        //     if(i % 2 == 1){
        //         seriesranking1.push(ranking);
        //     } else {
        //         seriesranking2.push(ranking);
        //     }
        // }
        // updateTable("seriesranking1", seriesranking1);
        // updateTable("seriesranking2", seriesranking2);

        updateTable("ranking", rankings);
        localizeAll(lang);
    }

    function updateCCRankingList() {
        let ccheader = $('#ccranking_header');
        ccheader.html("");
        for (let i = 0; i < cc_rankings[0].length; i ++) {
            let th = $(`<th>${cc_rankings[0][i]}</th>`);

            if (i == 0 || i == 1) 
                th.addClass("col-rank text-center px-02");
            else if (i == 2 || i == 3)
                th.addClass("w-50");
            else if (i == 4)
                th.addClass("col-nation px-0");
            else if (i >= 5 && i <= 10)
                th.addClass("col-point px-02 text-center font-13");

            ccheader.append(th)
        }
        
        let ccbody = $('#ccranking_body');
        ccbody.html("");
        for (let i = 1; i < cc_rankings.length; i ++) {
            const row = $("<tr class=''></tr>");

            for (let k = 0; k < cc_rankings[i].length; k ++) {

                let v = cc_rankings[i][k];
                if (k == 0) v = `${v}.`;
                let td = $(`<td>${v}</td>`);

                if (k == 0)
                    td.addClass("col-rank text-center bg-white text-color-black px-02");
                else if (k == 1)
                    td.addClass("col-rank text-center bg-color-macaroni text-color-black px-02");
                else if (k == 2)
                    td.addClass("w-50 col-horse");
                else if (k == 3)
                    td.addClass("w-50 col-rider");
                else if (k == 4) {
                    const url = `/flags/${cc_rankings[i][k]}.bmp`;
                    td.css("background", `#232323 url('${url}') center no-repeat`).css("background-size", "contain");
                    td.attr("data-toggle", "tooltip").attr("title", cc_rankings[i][k]);
                    td.html('');
                }
                else if (k == 5)
                    td.addClass("col-point col-font-monospace text-right bg-color-green text-color-black px-02 body");
                else if (k > 5 && k <= 9) {
                    if (k == 8 || k == 9)
                        td.addClass("col-point col-font-monospace text-right bg-color-perano text-color-black px-02 body");
                    else
                        td.addClass("col-time col-font-monospace text-right bg-color-pale-canary text-color-black px-02 body");
                }
                else if (k == 10)
                    td.addClass("col-time col-font-monospace text-right bg-color-final text-color-black px-02 body");
                
                if (k == 5) {
                    td.html(formatPoint({point:cc_rankings[i][5]}));
                }
                if (k == 6) {
                    if (cc_rankings[i][7] >= 0)
                        td.html(formatTime({time:cc_rankings[i][6]}));
                    else
                        td.html("&nbsp;");
                }
                if (k == 7) {
                    td.html(formatPoint({point:cc_rankings[i][7]}))
                }

                if (k == 8) {
                    if (cc_rankings[i][9] >= 0)
                        td.html(tickToTimeD(cc_rankings[i][8]));
                    else
                        td.html("&nbsp;");
                }
                if (k == 9) {
                    td.html(formatPoint({point:cc_rankings[i][9]}))
                }

                if (k == 10) {
                    if (cc_rankings[i][10] < 0) 
                        td.html("&nbsp;");
                    else
                        td.html(formatPoint({point:cc_rankings[i][10]}));
                }

                row.append(td);
            }

            ccbody.append(row);
        }

        localizeAll(lang);
    }

    function addRow(rowData, container, isData, classes, horse, rider, swapNumAndRank, hideRank, id) {
        if (!rowData) { return; }
        const row = id?$("<tr class='' id='" + id + "'></tr>") : $("<tr class=''></tr>");
        const cols = [];
        for (let i = 0; i < rowData.length; i++) {
            let style = '';
            const dot = i === 0 && isData && rowData[i] !== '' ? '.' : '';
            if (i === 0) { style = classes.rnkClass; }
            if (i === 1) { style = classes.numClass; }
            if (i === 2) { style = classes.horseClass; }
            if (i === 3) {
                style = classes.riderClass;
            }
            if (i === 4) { style = classes.flagClass; }
            if (i >= 5 && i % 2 === 1) { style = classes.pointsClass; }
            if (i >= 5 && i % 2 === 0) { style = classes.timeClass; }
            let v = rowData[i];
            if (i === 0 && isData && v !== '') {
                // Rank column
                v = `${v}.`;
            }
            if (i === 2 || i === 3) {
                // horse, rider column
                v = `<span>${v}</span>`;
                if (i === 2 && horse) {
                    v = `<span>${horse.name}</span>`;
                    // const arr = [horse.passport, horse.gender, horse.owner, horse.father, horse.mother, horse.fatherOfMother, horse.signalementLabel];
                    const arr = [horse.passport, horse.owner, horse.father, horse.mother, horse.fatherOfMother, horse.signalementLabel];
                    const filtered = arr.filter(v => v);
                    //if (arr.length <= filtered.length + 2) 
                    {
                        const additional = `<span class="font-light">${filtered.join("/")}</span>`;
                        v = `${v}<br>${additional}`;
                    }
                }
                if (i === 3 && rider) {
                    v = `<span>${rider.firstName} ${rider.lastName}</span>`;
                    const arr = [rider.nation, rider.city, rider.license, rider.club];
                    const filtered = arr.filter(v => v);
                    //if (arr.length <= filtered.length + 2) 
                    {
                        const additional = `<span class="font-light">${filtered.join("/")}</span>`;
                        v = `${v}<br>${additional}`;
                    }
                }
            }
            if (i >= 5 && (i % 2 === 1 || i % 2 === 0)) {
                // TODO: point column or time column
				if(v == 0.00 && hideRank)
					v = '';
				v = `<span>${v}</span>`;
            }
            const colType = isData ? 'td' : 'th';
            const col = $(`<${colType} class='${style}'>${v}</${colType}>`);
            if (i === 4 && isData) {
                const url = `/flags/${rowData[i]}.bmp`;
                col.css("background", `#232323 url('${url}') center no-repeat`).css("background-size", "contain");
                col.attr("data-toggle", "tooltip").attr("title", rowData[i]);
                col.html('');
            }
            if (i === 0 && hideRank) {
                col.addClass("d-none");
            }
            if (i === 1 && hideRank) {
                col.addClass("col-num-lg");
            }
            cols.push(col);
        }
        if (swapNumAndRank) {
            const temp = cols[0].html();
            cols[0].html(cols[1].html());
            cols[1].html(temp);

            const tempStyle = cols[0].attr('class');
            cols[0].attr('class', cols[1].attr('class'));
            cols[1].attr('class', tempStyle);
        }
        cols.forEach(col => row.append(col));
        container.append(row);
        return row;
    };


    function updateHeaders(header) {
        const tables = ['ranking', 'seriesranking1', 'seriesranking2','team_ranking', 'current', 'finish', 'nextriders', 'startlist'];
        tables.forEach(tableName => {
            const tableHeader = $(`#${tableName}_header`);
            tableHeader.html('');
            if (tableName === 'startlist') {
                const temp = header[0];
                header[0] = header[1];
                header[1] = temp;
            }
            addRow(header, tableHeader, false, headerClasses, null, null, false, tableName === 'nextriders');
        });
    }

    function updateTable(tableName, table) {
        if (table.length < 1) { return; }
        const tableBody = $(`#${tableName}_body`);
        tableBody.html('');
        for (let i = 1; i < table.length; i++) {
            let num = table[i][1];
            let startlistentry = startlistmap[num];
            if (startlistentry !== undefined) {
                const horseIdx = startlistentry.horse_idx;
                const riderIdx = startlistentry.rider_idx;
                const horse = horses[horseIdx];
                const rider = riders[riderIdx];
                addRow(table[i], tableBody, true, dataClasses, horse, rider, false, tableName === 'nextriders');
            }
        }
    }

    function updateEventList() {
        $('#live-events').html('');

        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            $('#live-events').append($('<tr class="d-flex">'));
            tr = $('#live-events tr:last');
            tr.append($('<td class="col-3">').html("&nbsp"));
            tr.append($('<td class="col-5">').html("&nbsp"));
            tr.append($('<td class="col-2">').html("&nbsp"));
            tr.append($('<td class="col-2">').html("&nbsp"));

            tr.children("td:nth-child(1)").html(event.info.title);
            const eventTitle = $(`<div> <div class="mb-2">${event.info.eventTitle}</div> </div>`);
            // TODO: remove `hidden` class when the estimation calculation is fixed
            const eventProgress = $(`<div class="progress"><div class="progress-bar" role="progressbar" style="width: 70%">35 / 75</div></div> <div class="mt-2 hidden"><span id="event" data-key="ETA">Estimated Time of Completion: </span><span id="eta">11:45</span></div>`);
            if (gameInfo.eventId === event.id) {
                console.log('gameinfo = ', gameInfo);
                eventTitle.append(eventProgress);
            }
            tr.children("td:nth-child(2)").html($(eventTitle));

            tr.children("td:nth-child(3)").html(formatDate(event.info.startDate));
            tr.children("td:nth-child(4)").html(formatDate(event.info.endDate));

            tr.attr("data-ref", event.id);

            tr.click(function() {
                evendId = $(this).attr("data-ref");
                joinToEvent(evendId);
                //location.href = "http://" + location.host + "/cross";
                //location.href = "/cross";
            });
        }

        updateEventProgress();

        $("#current_body").html('');
        $("#nextriders_body").html('');
        $("#finish_body").html('');
    }

    function updateEventProgress() {
        const eventCount = events.length;
        for (let i = 0; i < eventCount; i++) {
            const event = events[i];
            if (gameInfo.eventId === event.id) {
                const progress = Math.floor(100 * gameInfo.started_count / startlist.length);
                const now = new Date();
                const time = event.info.gameBeginTime || '';
                const match = time.match(/\[.*\]\s+(\d{1,2}:\d{1,2}:\d{1,2})\.\d+/);
                if (match && match.length) {
                    event.info.gameBeginTime = match[1];
                } else {
                    event.info.gameBeginTime = `${now.getHours() - 1}:${now.getMinutes()}:${now.getSeconds()}`;
                }

                const startDate = new Date(`${now.getFullYear}-${now.getMonth()}-${now.getDate()} ${event.info.gameBeginTime}`);
                const diff = (now.getTime() - startDate.getTime()) / 1000;
                const remainingProgress = 100 - progress;
                const remainingTime = diff * remainingProgress / 100;
                const endDate = new Date(now.getTime() + remainingTime);

                let progressElement = $(`#live-events tr:nth-child(${i+1}) td:nth-child(2) .progress-bar`);
                let etaElement = $(`#live-events tr:nth-child(${i+1}) td:nth-child(2) #eta`);
                progressElement.css('width', `${progress}%`);
                progressElement.html(`${gameInfo.started_count} / ${startlist.length}`);
                etaElement.html(formatSimpleTime(endDate));

                progressElement = $(".progress-wrapper .progress-bar");
                etaElement = $(".progress-wrapper #eta");
                progressElement.css('width', `${progress}%`);
                progressElement.html(`${gameInfo.started_count} / ${startlist.length}`);
                etaElement.html(formatSimpleTime(endDate));
            }
        }
        localizeKey('ETA');
    }

    function joinToEvent(eventId) {
        let event = events.find((event) => {
            return (event.id == eventId);
        });

        if (event === undefined) {
            //$("#error_noevent").show();
            return;
        }

        $("#error_noevent").hide();
        $("#error_finishevent").hide();

        socket.emit("subscribe", eventId);
        curEvent = eventId;
        realtime.num = 0;
        finished = Array();
        $("#current_body").html('');
        $("#nextriders_body").html('');
        $("#finish_body").html('');

        $('#event_list').hide();
        $('#start_list').hide();
        $('#event_view').show();
        $("#nextriders_list").show();
        $("#current_list").show();
        $("#finished_list").show();
        $("#ranking_list").show();
        // $("#start_list").show();
    }

    // goto event list
    $("#goto-events").click(function() {

        socket.emit('unsubscribe', curEvent);

        location.href = "/";

        return;
        
        clearInterval(rolling_timer);
        timer_running = false;

        $('#error_finishevent').hide();

        $('#event_list').show();
        $('#event_view').hide();

        

        updateEventList();
    });

    $('#event_view').hide();
    $('#event_list').show();
});

$(".nav .nav-link").click(function() {
    $(this).parents("ul").find("div.nav-link").removeClass("active");
    $(this).addClass("active");

    var menu_id = $(this).attr("id");

    $("section#sec-live").css("display", "none");
    $("section#sec-startlist").css("display", "none");
    $("section#sec-ranking").css("display", "none");
    $("#current_list_back").show();

    if (menu_id == "nav-live") {
        $("#nextriders_list").show();
        $("#current_list").show();
        $("#finished_list").show();
        $("#ranking_badge").show();
        $("#ranking_list").show();
        $("#start_list").hide();
        $("#seriesranking_list").hide();
        $("#ccranking_list").hide();
    } else if (menu_id == "nav-startlist") {
        $("#nextriders_list").hide();
        $("#current_list").hide();
        $("#finished_list").hide();
        $("#ranking_list").hide();
        $("#start_list").show();
        $("#seriesranking_list").hide();
        $("#ccranking_list").hide();
        $("#current_list_back").hide();
    } else if (menu_id == "nav-ranking") {
        $("#nextriders_list").hide();
        $("#current_list").hide();
        $("#finished_list").hide();
        $("#ranking_list").show();
        $("#start_list").hide();
        $("#ranking_badge").hide();
        $("#seriesranking_list").hide();
        $("#ccranking_list").hide();
    } else if (menu_id == "nav-ccranking") {
        $("#nextriders_list").hide();
        $("#current_list").hide();
        $("#finished_list").hide();
        $("#ranking_list").hide();
        $("#start_list").hide();
        $("#ranking_badge").hide();   
        $("#seriesranking_list").hide();
        $("#ccranking_list").show();
        $("#current_list_back").hide();
    } else if (menu_id == "nav-seriesranking") {
        $("#nextriders_list").hide();
        $("#current_list").hide();
        $("#finished_list").hide();
        $("#ranking_list").hide();
        $("#team_ranking_list").hide();
        $("#start_list").hide();
        $("#ranking_badge").hide();
        $('#current_list_back').hide();
        $('#current_list_back').css({top: "1400px"});
        $("#seriesranking_list").show();
        $("#ccranking_list").hide();
    }
});

$(document).ready(() => {
    //var language = window.navigator.userLanguage || window.navigator.language;
    //en-US
    //en-GB
    //de
    //fr
    //it

    //const language = navigator.language;
    const language = window.navigator.userLanguage || window.navigator.language
    lang = language.match(/(\w+)(-\w+)?/)[1];
    $("#lang").val(lang);
    localizeAll(lang);

    $('.logo').click(function(){
        location.href = "https://zeitmessungen.ch/"
    });
});