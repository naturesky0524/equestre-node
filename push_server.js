require('dotenv').config();

// Setup basic express server
var express = require('express');
var app = express();
var router = express.Router();
var server = require('http').createServer(app);
var io = require('socket.io')(server);

var port = process.env.SOCKETIO_PORT || 21741;
//var io = require('socket.io').listen(port);

var ranking = require('./ranking');

var totalConnected = 0;

var dbaction = require('./db_actions');
var Q = require('q');

const fs = require('fs');

const path = require('path');


server.listen(port, function() { //port
    console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(__dirname + '/public'));


app.get('/jumping', function(req,res){
    //console.log(req.query.eventid);
   res.sendfile(__dirname + '/public/jumping.html');
});

app.get('/cross', function(req,res){
    //console.log(req.query.eventid);
   res.sendfile(__dirname + '/public/cross.html');
});

app.get('/dressage', function(req,res){
    //console.log(req.query.eventid);
   res.sendfile(__dirname + '/public/dressage.html');
});


// current running events
/*
    each event has the following status variables
    {
        id: <eventId>           // eventId from database
        info: {},               // from <info> command
        riders: [{}]            // from <riders> command
        horses: [{}]            // from <horses> command
        ranking: [{}]           // from <ranking> command
        startlist: []           // from <startlist> command
        round1TableType: number // table 1 sort type
        realtime: {
            no, lane, startTime, score: { lane1: { time, timePenalty, point, pointPenalty }, lane2: { time, timePenalty, point, pointPenalty } }
        }                       // updated from <run> <timer1> <dnf> <final>
        finalNo:                // from <final> command
        running:                // set true from <run>, set false from <final>
        paused:                 // set from <run>
    }
 */
var events = [];
var sockets = {};


app.get('/xls/:eventid', function(req,res) {

    let event = events.find((event) => {
        return event.id == req.params.eventid;
    });

    if (event === undefined) return;

    //event.info.xlsname
    let xls = __dirname + "/public/rosson/" + event.id + ".xls";

    fs.stat(xls, function(err, stat) {
        if(err == null) {
            res.download(xls, event.info.xlsname);
        } else if(err.code == 'ENOENT') {
            // NO exist
        } 
    });
});

app.get('/pdf/:file', function(req,res) {

    //event.info.xlsname
    let pdf = __dirname + "/public/pdfs/" + req.params.file;

    fs.stat(pdf, function(err, stat) {
        if(err == null) {
            res.download(pdf);
        } else if(err.code == 'ENOENT') {
            // NO exist
        } 
    });
});

app.get('/qrcode_pdf', function(req,res) {

    //event.info.xlsname
    let pdf = __dirname + "/public/QR-Code Vorlage de fr it.pdf";

    fs.stat(pdf, function(err, stat) {
        if(err == null) {
            res.download(pdf);
        } else if(err.code == 'ENOENT') {
            // NO exist
        } 
    });
});

app.get('/qrcode_docx', function(req,res) {

    //event.info.xlsname
    let pdf = __dirname + "/public/QR-Code Vorlage de fr it.docx";

    fs.stat(pdf, function(err, stat) {
        if(err == null) {
            res.download(pdf);
        } else if(err.code == 'ENOENT') {
            // NO exist
        } 
    });
});

/*
    socket commands
    subscribe <roomId>,  roomId = provider | consumer | eventId
    unsubscribe <roomId>
    push { cmd: cmd, ... }

 */
io.on('connection', function(socket) {

    socket.on('disconnect', () => {
        totalConnected -= 1;
        io.emit('connectedUserCount', Math.max(1, totalConnected - 1));
    });

    socket.on('subscribe', function(room) {
        console.log("[on] subscribe: " + room);

        totalConnected = Object.keys(io.sockets.sockets).length
        io.emit('connectedUserCount', Math.max(1, totalConnected - 1));

        // send about the event
        if (room === "provider") {

            socket.join(room);
            console.log("joined to: " + room);
        } else if (room === "consumer") {
            socket.join(room);
            console.log("joined to: " + room);

            // send running events
            let eventInfos = events.map((event) => {
                return { id: event.id, info: event.info, paused: event.paused };
            });
            console.log("[emit] socket:events" + JSON.stringify(eventInfos));
            socket.emit('events', eventInfos);

            // console.log("[emit] socket:push");
            // socket.emit("push", { cmd:"info", status:"success", data:{id: 0}});
        } else {
            // findout the event
            let event = events.find((event) => {
                return event.id == room;
            });

            if (event === undefined) {
                console.log("cannot find room");
                return;
            }
            console.log("found event: ");
            if (socket.eventIdJoint === event.id) {
                console.log("already joined.");
                return;
            }

            // leave from prev and join to new
            if (socket.eventIdJoint !== undefined) {
                console.log("leave from: " + socket.eventIdJoint);
                socket.leave(socket.eventIdJoint);
            }
            console.log("joined to: " + event.id);
            socket.join(event.id);
            socket.eventIdJoint = event.id;

            // send the information
            console.log("[emit] socket:info");

            event.info.server_time = Date.now();
            socket.emit('info', event.info);

            console.log("[emit] socket:startlist");
            socket.emit('startlist', event.startlist);
            socket.emit('competitors', event.competitors);

            console.log("[emit] socket:horses");
            socket.emit('horses', event.horses);

            console.log("[emit] socket:riders");
            socket.emit('riders', event.riders);

            console.log("[emit] socket:judges");
            socket.emit('judges', event.judges);

            console.log("[emit] socket:teams");
            socket.emit('teams', event.teams);            

            ///////////////////////////////////////////////////////////
            //socket.emit('realtime', event.realtime);

            console.log("[emit] socket:ranking");
            socket.emit('ranking', { ranking: event.ranking, team_ranking: event.team_ranking, gameInfo: event.gameInfo });
            
            if (event.info.eventing) {
                console.log("[emit] socket:ccranking");
                socket.emit('cc-ranking', event.cc_ranking);
            }


            if (event.info.discipline == 0) { // for jumping
                if (event.realtime.num !== undefined) {
                    console.log("[emit] socket:realtime(initial) " + JSON.stringify(event.realtime));
                    socket.emit('realtime', event.realtime);

                    if (event.running && event.paused == false) {
                        console.log("[emit] socket:resume ");
                        socket.emit('resume');
                        io.emit('nofifyResume', {eventId: event.id});
                    } else {
                        // check whether current horse is finished
                        if (event.finalNo === event.realtime.num) {
                            console.log("[emit] socket:final ");
                            socket.emit('final')
                        } else {
                            console.log("[emit] socket:ready ");
                            socket.emit('ready');
                        }
                    }
                }
            } else if (event.info.discipline == 2) { // for Cross
                socket.emit('live_info', getLiveInfo(event));
            }
        }
    });

    socket.on('unsubscribe', function(room) {
        console.log("[on] unsubscribe: " + room);
        totalConnected -= 1;
        console.log('connections: ', totalConnected);

        roomId = '' + room;
        let rooms = Object.keys(socket.rooms);
        console.log("rooms=" + JSON.stringify(rooms));

        if (rooms.includes(roomId) === false) {
            console.error("cannot find room");
            return;
        }

        if (socket.eventIdJoint != room) {
            console.error("cannot unsubscribe from " + room);
            return;
        }

        console.log("unsubscribe from: " + room);
        socket.leave(room);
        socket.eventIdJoint = undefined;
    });

    socket.on('push', function(msg) {

        // console.log("push: " + msg);
        // check if provider
        let rooms = Object.keys(socket.rooms);
        if (rooms.includes('provider') === false) {
            console.error("invalid push from client");
            return;
        }

        var obj = ((msg) => {
            try {
                return JSON.parse(msg);
            } catch (e) {
                return false;
            }
        })(msg);

        if (!obj || typeof obj.cmd === 'undefined') {
            console.error("invalid message");
            return;
        }

        if (obj.cmd === 'atstart') {
            processAtStart(obj);
        } else if (obj.cmd === 'final') {
            processFinal(obj);
        } else if (obj.cmd === 'run') {
            processRun(obj);
            // } else if (obj.cmd === 'sync') {
            //     processSync(obj);
        } else if (obj.cmd === 'timer1') {
            processTimer1(obj);
        } else if (obj.cmd === 'dnf') {
            processDNF(obj);
        } else if (obj.cmd === 'info') {
            processInfo(obj);
        } else if (obj.cmd === 'ready') {
            processReady(obj);
        } else if (obj.cmd === 'horses') {
            processHorses(obj);
        } else if (obj.cmd === 'riders') {
            processRiders(obj);         
        } else if (obj.cmd === 'judges') {
                processJudges(obj);        
        } else if (obj.cmd === 'teams') {
            processTeams(obj);
        } else if (obj.cmd === 'ranking') {
            processRanking(obj);        
        } else if (obj.cmd === 'cc-ranking') {
            processCCRanking(obj);
        } else if (obj.cmd === 'startlist') {
            processStartlist(obj);
        } else if (obj.cmd === 'exit') {
            processExit(obj);
        } else if (obj.cmd == 'xls') {
            processXls(obj);            
        } else if (obj.cmd == 'pdf') {
            processPdf(obj);
        } else if (obj.cmd == 'link') {
            processLink(obj);
        } else if (obj.cmd == 'delete') {
            processDelete(obj);
        }
    });

    socket.on('push_cross', function(msg) {

        // console.log("push: " + msg);
        // check if provider
        let rooms = Object.keys(socket.rooms);
        if (rooms.includes('provider') === false) {
            console.error("invalid push from client");
            return;
        }

        var obj = ((msg) => {
            try {
                return JSON.parse(msg);
            } catch (e) {
                return false;
            }
        })(msg);

        if (!obj || typeof obj.cmd === 'undefined') {
            console.error("invalid message");
            return;
        }

        if (obj.cmd === 'CrossTI0') {
            processCrossTI0(obj);
        } else if (obj.cmd == "CrossSTART_I") {
            processCrossSTART_I(obj);
        } else if (obj.cmd == "CrossEND_I") {
            processCrossEND_I(obj);
        } else if (obj.cmd === 'CrossS') {
            processCrossS(obj);
        } else if (obj.cmd === 'CrossR') {
            processCrossR(obj);
        } else if (obj.cmd === 'CrossF') {
            processCrossF(obj);
        } else if (obj.cmd === 'CrossSYNC') {
            processCrossSYNC(obj);
        } else if (obj.cmd === 'info') {
            processInfo(obj);
        } else if (obj.cmd === 'horses') {
            processHorses(obj);
        } else if (obj.cmd === 'riders') {
            processRiders(obj);
        } else if (obj.cmd === 'ranking') {
            processRanking(obj);        
        } else if (obj.cmd === 'cc-ranking') {
            processCCRanking(obj);
        } else if (obj.cmd === 'startlist') {
            processStartlist(obj);
        } else if (obj.cmd === 'exit') {
            processExit(obj);
        } else if (obj.cmd == 'xls') {
            processXls(obj);
        } else if (obj.cmd == 'pdf') {
            processPdf(obj);
        } else if (obj.cmd == 'link') {
            processLink(obj);
        } else if (obj.cmd == 'delete') {
            processDelete(obj);
        }

    });

    function getSocketEvent() {
        if (socket.eventId === 0) {
            console.error('invalid eventId');
            return false;
        }

        // find event
        let event = events.find((event) => {
            return event.id === socket.eventId;
        });

        if (event === undefined) {
            console.error('eventId not found in current list:' + socket.eventId);
            return false;
        }
        return event;
    }
    /////////***   command processors   ***////////////////////////////////////////

    // query and save to database and get eventId
    async function processInfo(command) {
        // command { title, eventTitle, startDate, endDate, eventDate }

        console.log("processInfo: " + JSON.stringify(command));

        try {
            // find the event from event list
            // let eventFound = events.find(function(event) {
            //     return (event.info.eventTitle === command.eventTitle) && (event.info.eventDate === command.eventDate);
            // });

            let eventId = 0;

            // if (eventFound === undefined) {
            //     // get event id from database
            //     eventId = await dbaction.findEvent(command.eventTitle, command.eventDate);
            //     if (eventId === 0) {
            //         eventId = await dbaction.addEvent(command);
            //     }
            //     //eventId = Date.now();
            // } else {
            //     eventId = eventFound.id;
            // }
            if(command.meetingNumber == 0) return
            eventId = command.meetingNumber + "_" + command.eventNumber + '_' + command.discipline;

            socket.eventId = eventId;
            
            // add to the event list
            let event = getSocketEvent();

            if (event === false) {
                // initialize event
                event = { id: eventId, info: command, riders: [], horses: [], ranking: [], startlist: [], realtime: {}, finalNo: 0, running: false, paused: false, };
                events.push(event);
                sockets[eventId] = socket;
                console.log("new event pushed: ");

                // alarm to all client
                console.log("[emit] consumer:start "/* + JSON.stringify(event)*/);

                socket.to("consumer").emit('start', event);
            } else {
                event.info = {...event.info, ...command };
                sockets[eventId] = socket;
                console.log("update event: " + event.info.toString());
            }

            event.info.id = eventId;
            event.info.live = 1;

            event.players = {};
            event.sections = {
                start : [],
                live : [],
                finish : []
            }
            
            // alarm to client
            console.log("[emit] " + eventId + ":info " + JSON.stringify(event.info));
            if (event.info.gameBeginTime) {
                const time = event.info.gameBeginTime;
                const match = time.match(/\[.*\]\s+(\d{1,2}:\d{1,2}:\d{1,2})\.\d+/);
                if (match && match.length) {
                    event.info.gameBeginTime = match[1];
                }
            }
            socket.to(eventId).emit('info', event.info);

            socket.to('consumer').emit('info', event.info);

            // return result
            console.log("[emit] socket:push");
            socket.emit("push", { cmd: "info", status: "success", data: { id: eventId } });
            return eventId;
        } catch (error) {
            console.log("processInfo: failed" + JSON.stringify(error));
            console.log(error);
            return 0;
        }
    }

    // save to database
    async function processHorses(command) {
        console.log("processHorses started.");

        let event = getSocketEvent();
        if (event === false) {
            console.error("horses command: failed.");
            return;
        }

        console.log("event found: id=" + event.id + ", info=" + JSON.stringify(event.info));

        // save to status
        event.horses = command.list;

        // alarm to client
        console.log("[emit] " + event.id + ":horses ");
        socket.to(event.id).emit('horses', event.horses);

        // save to database
        try {
            await dbaction.deleteHorses(event.id);

            let affected = 0;
            for (let horse of command.list) {
                var success = await dbaction.addHorse(event.id, horse);
                if (success == 1) {
                    affected++;
                }
            }

            console.log("horses command: inserted=" + affected);

        } catch (err) {
            console.log("horses command failed: " + JSON.stringify(err));
        }

        console.log("processHorses finished.");
    }

    // save to database
    async function processJudges(command) {
        console.log("processJudges started.");

        let event = getSocketEvent();
        if (event === false) {
            console.error("judges command: failed.");
            return;
        }

        console.log("event found: id=" + event.id + ", info=" + JSON.stringify(event.info));

        // save to status
        event.judges = command.list;

        // alarm to client
        console.log("[emit] " + event.id + ":judges ");
        socket.to(event.id).emit('judges', event.judges);

        /*
        // save to database
        try {
            await dbaction.deleteHorses(event.id);

            let affected = 0;
            for (let horse of command.list) {
                var success = await dbaction.addHorse(event.id, horse);
                if (success == 1) {
                    affected++;
                }
            }

            console.log("horses command: inserted=" + affected);

        } catch (err) {
            console.log("horses command failed: " + JSON.stringify(err));
        }
        */

        console.log("processJudges finished.");
    }    

    async function processRiders(command) {
        console.log("processRiders started.");

        let event = getSocketEvent();
        if (event === false) {
            console.error("riders command: failed.");
            return;
        }

        // save to status
        event.riders = command.list;

        // alarm to client
        console.log("[emit] " + event.id + ":riders ");
        socket.to(event.id).emit('riders', event.riders);

        // save to database
        try {
            await dbaction.deleteRiders(event.id);

            let affected = 0;
            for (let rider of command.list) {
                var success = await dbaction.addRider(event.id, rider);
                if (success == 1) {
                    affected++;
                }
            }
            console.log("riders command: inserted=" + affected);
        } catch (err) {
            console.log("riders command failed: " + JSON.stringify(err));
        }
        console.log("processRiders finished.");
    }

    async function processTeams(command) {

        
        console.log("processTeams started.");

        let event = getSocketEvent();
        if (event === false) {
            console.error("teams command: failed.");
            return;
        }

        // save to status
        event.teams = command.list;

        // alarm to client
        console.log("[emit] " + event.id + ":teams ");
        socket.to(event.id).emit('teams', event.teams);

        console.log("processTeams finished.");
        
    }

    async function processRanking(command) {
        let event = getSocketEvent();
        if (event === false) {
            console.error("ranking command: failed.");
            return;
        }

        // save to status
        event.ranking = [];
        // round - displaying round. can be 0, 1, 2
        // jumpoff - displaying jumpoff. can be 0, 1, 2
        // round_score - round score table list
        // jumpoff_score - jumpoff score table list
        // round_count
        // jumpoff_count
        // round_table_types
        // jumpoff_table_types
        // allowed_time_rounds
        // allowed_time_jumpoffs
        // against_time_clock_rounds
        // against_time_clock_jumpoffs
        //      table types - 0: Table A, 1: Table C, 2: Table Penalties, 10: Table Optimum

        // alarm to client
        console.log("[emit] " + event.id + ":ranking ");
        const twoPhaseIntegrated = command.two_phase_integrated;
        const twoPhaseDiffered = command.two_phase_differed;
        event.gameInfo = {};
        [event.ranking, event.gameInfo] = ranking.generateRanking(command.round_score, command.jumpoff_score, command.round_count, command.jumpoff_count, command.round, command.jumpoff, command.round_table_types, command.jumpoff_table_types,
            command.allowed_time_rounds, command.allowed_time_jumpoffs, command.against_time_clock_rounds, command.against_time_clock_jumpoffs, twoPhaseIntegrated, twoPhaseDiffered, event.info.discipline);
        event.gameInfo.gameBeginTime = event.gameBeginTime;

        event.team_ranking = [];

        if (event.info.modeTeam) { // Nation Cup or Team Cup
            var team_members_ranking = {};
            var teams_ranking = [];
            var gameinfo = {};
    
            for (let teaminfo of event.teams) {
    
                let team_ranking = {};
    
                let team_round_score = command.round_score.slice(0);
                let team_jumpoff_score = command.jumpoff_score.slice(0);
    
                for (let i = 0; i < team_round_score.length; i ++) {
                    let round_score = team_round_score[i];
                    round_score = round_score.filter(a => teaminfo.members.includes(a.num));
    
                    team_round_score[i] = round_score;
                }            
                
                for (let i = 0; i < team_jumpoff_score.length; i ++) {
                    let jumpoff_score = team_jumpoff_score[i];
                    jumpoff_score = jumpoff_score.filter(a => teaminfo.members.includes(a.num));
    
                    team_jumpoff_score[i] = jumpoff_score;
                }
                
                [team_ranking, gameinfo] = ranking.generateRanking(team_round_score, team_jumpoff_score, command.round_count, command.jumpoff_count, command.round, command.jumpoff, command.round_table_types, command.jumpoff_table_types,
                    command.allowed_time_rounds, command.allowed_time_jumpoffs, command.against_time_clock_rounds, command.against_time_clock_jumpoffs, twoPhaseIntegrated, twoPhaseDiffered, event.info.discipline);
    
                team_members_ranking[teaminfo.num] = team_ranking;
            }
    
            let teams_round_score = [];
            let teams_jumpoff_score = [];
    
            for (let i = 0; i < command.round_score.length; i ++) {
    
                teams_round_score[i] = [];
                let roundinfo = command.round_score[i];
    
                if (!roundinfo.length) continue;
    
                for (let team_num in team_members_ranking) {
    
                    let ranks = team_members_ranking[team_num];
    
                    let cnt = ranks.length>4 ? 4 : ranks.length;
                    
                    let team_info = {num: team_num, point: 0, pointPlus: 0, time: 0, timePlus: 0};
                    for (let k = 1; k < cnt && cnt >= 4; k ++) {
                        let rider_num = ranks[k][1];
    
                        let rider_entry = roundinfo.find(a => a.num == rider_num);
    
                        if (!rider_entry) continue;
    
                        team_info.point += rider_entry.point;
                        team_info.pointPlus += rider_entry.pointPlus;
                        team_info.time += rider_entry.time;
                        team_info.timePlus += rider_entry.timePlus;
                    }
    
                    if (team_info.point || team_info.point || team_info.time || team_info.timePlus)
                        teams_round_score[i].push(team_info);
    
                }
            }
    
            for (let i = 0; i < command.jumpoff_score.length; i ++) {
    
                teams_jumpoff_score[i] = [];
                let jumpoffinfo = command.jumpoff_score[i];
    
                if (!jumpoffinfo.length) continue;
                
                for (let team_num in team_members_ranking) {
    
                    let ranks = team_members_ranking[team_num];
    
                    let cnt = ranks.length>4 ? 4 : ranks.length;
    
                    if (cnt < 4) continue;
                    
                    let team_info = {num: team_num, point: 0, pointPlus: 0, time: 0, timePlus: 0};
                    for (let k = 1; k < cnt; k ++) {
                        let rider_num = ranks[k][1];
    
                        let rider_entry = jumpoffinfo.find(a => a.num == rider_num);
    
                        if (!rider_entry) continue;
    
                        team_info.point += rider_entry.point;
                        team_info.pointPlus += rider_entry.pointPlus;
                        team_info.time += rider_entry.time;
                        team_info.timePlus += rider_entry.timePlus;
                    }
    
                    teams_jumpoff_score[i].push(team_info);
    
                }
            }
            
            [teams_ranking, gameInfo] = ranking.generateRanking(teams_round_score, teams_jumpoff_score, command.round_count, command.jumpoff_count, command.round, command.jumpoff, command.round_table_types, command.jumpoff_table_types,
                command.allowed_time_rounds, command.allowed_time_jumpoffs, command.against_time_clock_rounds, command.against_time_clock_jumpoffs, twoPhaseIntegrated, twoPhaseDiffered, event.info.discipline);
    
            event.team_ranking.push(teams_ranking[0]);
    
            for (let i = 1; i < teams_ranking.length; i ++) {
    
                let team_num = teams_ranking[i][1];
    
                event.team_ranking.push(teams_ranking[i]);
    
                team_rank_entry = team_members_ranking[team_num]; 
    
                for (let j = 1; j < team_rank_entry.length; j ++) {
                    event.team_ranking.push(team_rank_entry[j]);
                }
            }    
        }

        //socket.to(event.id).emit('ranking', { ranking: event.ranking, gameInfo: event.gameInfo });

        socket.to(event.id).emit('ranking', { ranking: event.ranking, team_ranking: event.team_ranking, gameInfo: event.gameInfo });

        // save to database
        try {
            // delete previouse data
            await dbaction.deleteRankings(event.id);

            let affected = 0;
            for (let rank of command.list) {
                var success = await dbaction.addRanking(event.id, rank);
                if (success == 1) {
                    affected++;
                }
            }
            console.log("ranking command: inserted=" + affected);
        } catch (err) {
            console.log("ranking command failed: " + JSON.stringify(err));
        }

        console.log("processRanking finished.");
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

    function sortCCRanks(a, b){

        if (a.dressage_status == 0 && b.dressage_status == 0) return 0;
        if (a.dressage_status == 0) return 1;
        if (b.dressage_status == 0) return -1;

        if (a.dressage_status > 1 && b.dressage_status > 1) 
            return a.dressage_status - b.dressage_status;

        if (a.dressage_status > 1) return 1;
        if (b.dressage_status > 1) return -1;




        if (a.jump_status == 0 && b.jump_status == 0) {
            return a.dressage_point - b.dressage_point;
        } 
        if (a.jump_status == 0) return 1;
        if (b.jump_status == 0) return -1;


        if (a.jump_status > 1 && b.jump_status > 1) 
            return a.jump_status - b.jump_status;
        if (a.jump_status > 1) return 1;
        if (b.jump_status > 1) return -1;




        if (a.cross_status == 0 && b.cross_status == 0) {
            return a.dressage_point + a.jump_point - b.dressage_point - b.jump_point;
        }
        if (a.cross_status == 0) return 1;
        if (b.cross_status == 0) return -1;

        
        if (a.cross_status > 1 && b.cross_status > 1) 
            return a.cross_status - b.cross_status;
        if (a.cross_status > 1) return 1;
        if (b.cross_status > 1) return -1;






        if (a.total_point == b.total_point)
            return a.dressage_point - b.dressage_point;

        return a.total_point - b.total_point
    }

    async function processCCRanking(command) {


        let event = getSocketEvent();
        if (event === false) {
            console.error("cc-ranking command: failed.");
            return;
        }

        event.cc_ranking = [];

        let ccRanks = command.ccRanks;

        ccRanks.forEach(s => {
            s.dressage_point = 1000 * Math.round(s.dressage_point / 100) / 10;
            s.cross_point = 1000 * Math.round(s.cross_point / 100) / 10;
            s.jump_point = 1000 * Math.round(s.jump_point / 100) / 10;
            s.total_point = s.dressage_point + s.cross_point + s.jump_point;
            s.total_point = Math.round(s.total_point * 10) / 10;
            //s.total_time = s.cross_time + s.jump_time;
            
            
            if (s.dressage_status > 1) 
            {
                s.dressage_point = - s.dressage_status;
                s.jump_point = -8;
                s.cross_point = -8;
                s.total_point = -8;
            }

            if (s.jump_status > 1) {
                s.jump_point = - s.jump_status;
                s.cross_point = -8;
                s.total_point = -8;
            }
            if (s.cross_status > 1) {
                s.cross_point = - s.cross_status;
                s.total_point = -8;
            }

            if (s.dressage_status == 0) 
            {
                s.dressage_point = -8;
                s.jump_point = -8;
                s.cross_point = -8;
            }

            if (s.jump_status == 0) {
                s.jump_point = -8;
                s.cross_point = -8;
            }
            if (s.cross_status == 0) {
                s.cross_point = -8;
            }
        });

        ccRanks.sort(sortCCRanks);

        let rank = 1;
        let prev = 0;
        for (let i = 0; i < ccRanks.length; i ++) {
            if (prev == 0) {
                ccRanks[i].rank = rank;
            } else {
                if (sortCCRanks(prev, ccRanks[i]) == 0) {
                    ccRanks[i].rank = prev.rank;
                } else {
                    ccRanks[i].rank = rank;
                }
            }

            prev = ccRanks[i];
            rank ++;
            
        }

        //ccRanks = ccRanks.filter(s => s.jump_status == 1 && s.cross_status == 1 && s.dressage_status == 1);

        const columnCount = 11;
        let riderCount = ccRanks.length;
    
        let result = Array(riderCount + 1).fill(0).map(() => Array(columnCount).fill(''));
    
        // format result table header
        result[0][0] = `<span data-key="RANK"></span>`;
        result[0][1] = `<span data-key="NUMBER"></span>`;
        result[0][2] = `<span data-key="HORSE"></span>`;
        result[0][3] = `<span data-key="RIDER"></span>`;
        result[0][4] = `<span data-key="NATION"></span>`;
        result[0][5] = `<span><div class="font-size-small no-wrap"><span data-key="DRESSAGE">Dressage</span></div><div data-key="POINTS" class="font-size-small">Points</div></span>`;
        result[0][6] = `<span><div class="font-size-small no-wrap"><span data-key="JUMP">Jumping</span></div><div data-key="TIME" class="font-size-small">Time</div></span>`;
        result[0][7] = `<span><div class="font-size-small no-wrap"><span data-key="JUMP">Jumping</span></div><div data-key="POINTS" class="font-size-small">Points</div></span>`;
        result[0][8] = `<span><div class="font-size-small no-wrap"><span data-key="CROSS">Cross</span></div><div data-key="TIME" class="font-size-small">Time</div></span>`;
        result[0][9] = `<span><div class="font-size-small no-wrap"><span data-key="CROSS">Cross</span></div><div data-key="POINTS" class="font-size-small">Points</div></span>`;
        result[0][10] = `<span data-key="TOTAL">TOTAL</span>`;

        for (let i = 0; i < riderCount; i ++) {
            result[i + 1][0] = ccRanks[i].rank;
            result[i + 1][1] = ccRanks[i].num;
            result[i + 1][2] = ccRanks[i].horse_idx;
            result[i + 1][3] = ccRanks[i].rider_idx;
            result[i + 1][4] = ""

            result[i + 1][5] = ccRanks[i].dressage_point;
            result[i + 1][6] = ccRanks[i].jump_time;
            result[i + 1][7] = ccRanks[i].jump_point;
            result[i + 1][8] = ccRanks[i].cross_time;
            result[i + 1][9] = ccRanks[i].cross_point;
            result[i + 1][10] = ccRanks[i].total_point;

            // result[i + 1][5] = ccRanks[i].dressage_point == -1? "" : ccRanks[i].dressage_point.toFixed(2);
            // result[i + 1][6] = ccRanks[i].jump_time == -1? "" : tickToTimeD(ccRanks[i].jump_time);
            // result[i + 1][7] = ccRanks[i].jump_point == -1? "" : ccRanks[i].jump_point.toFixed(2);
            // result[i + 1][8] = ccRanks[i].cross_time == -1? "" : tickToTimeD(ccRanks[i].cross_time);
            // result[i + 1][9] = ccRanks[i].cross_point == -1? "" : ccRanks[i].cross_point.toFixed(2);
            // result[i + 1][10] = ccRanks[i].total_point == -1? "" :ccRanks[i].total_point.toFixed(2);
        }

        socket.to(event.id).emit('cc-ranking', result);

        events.forEach(evt => {

            if (evt.id == event.id) return;

            if (event.info.title == evt.info.title) {
                
                let eventTitle = event.info.eventTitle.replace(/\s{1}\[.+\]/, "");
                let evtTitle = evt.info.eventTitle.replace(/\s{1}\[.+\]/, "");

                if (eventTitle == evtTitle) {
                    sockets[evt.id].to(evt.id).emit('cc-ranking', result);
                    evt.cc_ranking = result;
                    //evt.socket.to(evt.id).emit('cc-ranking', result);
                }
            }
        });

        event.cc_ranking = result;

        console.log("processCCRanking finished.");
    }

    async function processXls(command) {
        let event = getSocketEvent();

        if (command.type) {
            event = events.find(e => e.id == (command.eventid + '_' + command.runid + '_' + command.discipline)) || false;
        }

        if (event === false) {
            console.error("xls command: failed.");
            return;
        }

        let path = __dirname + '/public/rosson/' + event.id + ".xls";
        fs.writeFile(path, command.contents, err => {
            if (err) {
              console.error(err);
            }
            // file written successfully
        });

        event.info.xlsname = command.name;
        // send running events
        let eventInfos = events.map((event) => {
            return { id: event.id, info: event.info, paused: event.paused };
        });
        
        console.log("[emit] socket:events" + JSON.stringify(eventInfos));
        
        io.emit('events', eventInfos);      
        
    }

    async function processPdf(command) {
        let event = getSocketEvent();

        if (command.type) {
            event = events.find(e => e.id == (command.eventid + '_' + command.runid + '_' + command.discipline)) || false;
        }

        if (event === false) {
            console.error("pdf command: failed.");
            return;
        }

        let type = command.type;
        let discipline = command.discipline;
        let printnum = command.printnum;
        let title = command.title;
        let contents = command.contents;
        // event.id
        let filename = printnum + "_" + title + ".pdf";
        let path = __dirname + '/public/pdfs/' + filename;

        if (type) {
            filename = command.eventid + "_" + title;
            path = __dirname + '/public/pdfs/' + filename;
        }

        let buff = Buffer.from(contents, 'base64');

        fs.writeFile(path, buff, 'binary', err => {
            if (err) {
            console.error(err);
            }
            // file written successfully
        });

        let pdfid = discipline + "_" + printnum;

        if (type) {
            pdfid = filename;
        }

        event.info.pdfs = event.info.pdfs || {};
        event.info.pdfs[pdfid] = filename;

        // send running events
        let eventInfos = events.map((event) => {
            return { id: event.id, info: event.info, paused: event.paused };
        });
        
        console.log("[emit] socket:events" + JSON.stringify(eventInfos));
        
        io.emit('events', eventInfos);        
    }

    async function processLink(command) {
        // let event = getSocketEvent(); // get live event

        // if (command.type) {
        let event = events.find(e => e.id == (command.eventid + '_' + command.runid + '_' + command.discipline)) || false;
        // }
        const utf8Decoder = new TextDecoder('utf-8');
        const buffer = Buffer.from(command.text, 'utf-8'); 
        const decodedData = utf8Decoder.decode(buffer);
        console.log("processLink")
        console.log(decodedData)
        console.log(command.link)

        if (event === false) {
            console.error("link command: failed.");
            return;
        }

        let text = command.text;
        let link = command.link;
        event.info.links = event.info.links || {};
        event.info.links[text] = link;
        // event.info.link.link = link;

        // send running events
        let eventInfos = events.map((event) => {
            return { id: event.id, info: event.info, paused: event.paused };
        });
        
        console.log("[emit] socket:events" + JSON.stringify(eventInfos));
        
        io.emit('events', eventInfos);        
    }

    async function processDelete(command) {
        // let event = getSocketEvent(); // get live event

        if (command.type == 'run') {
            events = events.filter(e => e.id != (command.eventid + '_' + command.runid + '_' + command.discipline));
            // let eventIndex = events.findIndex(e => e.id == (command.eventid + '_' + command.runid + '_' + command.discipline)) || false;
        } else if (command.type == 'event') {
            events = events.filter(e => !(e.id.startsWith(command.eventid + '_')))
        }

        // if (eventIndex === -1) {
        //     console.error("delete command: failed.");
        //     return;
        // }

        // events.splice(eventIndex, 1);
        
        console.log("[emit] socket:events" + JSON.stringify(events));
        
        io.emit('events', events);        
    }

    async function processStartlist(command) {
        let event = getSocketEvent();
        if (event === false) {
            console.error("ranking command: failed.");
            return;
        }

        // save to status
        event.startlist = [];
        for (let startentry of command.list) {
            let entry = {...startentry, score: { lane1: {}, lane2: {} } };
            event.startlist.push(entry);
        }
        
        event.competitors = command.competitors;

        // alarm to client
        console.log("[emit] " + event.id + ":startlist ");
        socket.to(event.id).emit('startlist', event.startlist);
        socket.to(event.id).emit('competitors', event.competitors);


        // console.log(event.startlist);

        // save to database
        try {
            // delete previouse data
            await dbaction.deleteStartLists(event.id);

            let affected = 0;
            for (let startlistentry of command.list) {
                var success = await dbaction.addStartList(event.id, startlistentry);
                if (success == 1) {
                    affected++;
                }
            }
            console.log("startlist command: inserted=" + affected);
        } catch (err) {
            console.log("startlist command failed: " + JSON.stringify(err));
        }


        console.log("processStartlist finished.");
    }

    function processReady(command) {
        // command { number, lane };
        let event = getSocketEvent();
        if (event === false) {
            console.error("run command: failed.");
            return;
        }

        // initialize the real time
        event.realtime = { num: command.num, lane: command.lane, startTime: 0, score: { lane1: {}, lane2: {} } };

        console.log("[emit] " + event.id + ":realtime(ready) " + JSON.stringify(event.realtime));
        socket.to(event.id).emit('realtime', event.realtime);

        // alarm to client
        console.log("[emit] " + event.id + ":ready ");
        socket.to(event.id).emit('ready');
    }

    // update state
    function processRun(command) {
        // command { number, lane, point, time, startTime, pauseTime }

        let event = getSocketEvent();
        if (event === false) {
            console.error("run command: cannot find event.");
            return;
        }

        if (event.realtime.num === undefined) {
            console.error("run command: there is no number.");
            return;
        }

        // update status
        let updated = {};
        updated.num = command.num;
        updated.lane = command.lane;
        updated.startTime = command.startTime;
        updated.score = event.realtime.score;

        if (updated.lane === 1) {
            record = updated.score.lane1;
        } else {
            record = updated.score.lane2;
        }

        record.point = command.point;
        record.time = command.time;
        if (command.pauseTime !== 0) {
            record.time = command.pauseTime;
        }

        event.realtime = {...event.realtime, ...updated };

        // alarm to client
        socket.to(event.id).emit('realtime', event.realtime);

        if (event.running === false) {
            event.running = true;
            console.log("[emit] " + event.id + ":resume ");
            socket.to(event.id).emit('resume');
            io.emit('nofifyResume', {eventId: event.id});
        }

        // process pause
        if (command.pauseTime !== 0 && event.paused === false) {
            event.paused = true;
            console.log("[emit] " + event.id + ":pause ");
            socket.to(event.id).emit('pause', { finished: false });
            io.emit('nofifyPause', {eventId: event.id, finished: false});

        } else if (command.pauseTime === 0 && event.paused === true) {
            event.paused = false;
            // start timer...
            console.log("[emit] " + event.id + ":resume ");
            socket.to(event.id).emit('resume');
            io.emit('nofifyResume', {eventId: event.id});
        }
    }

    // function processSync(command) {
    //     // command.number;
    //     // command.lane;
    //     // command.time;
    //     // command.curTime;
    //
    //     let event = getSocketEvent();
    //     if(event === false) {
    //         console.error("run command: failed.");
    //         return ;
    //     }
    //
    //     // update status
    //     let updated = {};
    //     updated.num = command.num;
    //     updated.lane = command.lane;
    //     if(updated.lane === 1) {
    //         updated.time1 = command.time;
    //     } else {
    //         updated.time2 = command.time;
    //     }
    //
    //     event.realtime = { ...event.realtime, ...updated };
    //
    //     // alarm to client
    //     console.log("[emit] " + event.id + ":realtime(sync) " + JSON.stringify(event.realtime));
    //     socket.to(event.id).emit('realtime', event.realtime);
    // }

    function processTimer1(command) {
        // command.number;
        // command.lane;
        // command.time;
        // command.timePenalty;
        // command.point;
        // command.pointPenalty;

        let event = getSocketEvent();
        if (event === false) {
            console.error("run command: failed.");
            return;
        }

        if (event.realtime.num === undefined) {
            console.error("run command: there is no number.");
            return;
        }

        // update realtime status
        let updated = {};
        updated.num = command.num;
        updated.lane = command.lane;
        updated.score = event.realtime.score;

        let record;
        if (updated.lane === 1) {
            record = updated.score.lane1;
        } else {
            record = updated.score.lane2;
        }

        record.time = command.time + command.timePenalty;
        record.timePenalty = command.timePenalty;
        record.point = command.point + command.pointPenalty;
        record.pointPenalty = command.pointPenalty;

        event.realtime = {...event.realtime, ...updated };

        // alarm to client
        console.log("[emit] " + event.id + ":realtime(final) " + JSON.stringify(event.realtime));
        socket.to(event.id).emit('realtime', event.realtime);

        console.log("[emit] " + event.id + ":final ");
        socket.to(event.id).emit('final');
    }

    function processFinal(command) {
        // command.number;
        // command.lane;
        // command.point;
        // command.time;

        let event = getSocketEvent();
        if (event === false) {
            console.error("run command: failed.");
            return;
        }

        if (event.realtime.num === undefined) {
            console.error("run command: there is no number.");
            return;
        }

        // update status
        let updated = {};
        updated.num = command.num;
        updated.lane = command.lane;
        updated.score = event.realtime.score;

        let record;
        if (updated.lane === 1) {
            record = updated.score.lane1;
        } else {
            record = updated.score.lane2;
        }
        record.time = command.time;
        record.point = command.point;

        event.realtime = {...event.realtime, ...updated };

        // alarm to client
        console.log("[emit] " + event.id + ":realtime(final) " + JSON.stringify(event.realtime));
        socket.to(event.id).emit('realtime', event.realtime);

        console.log("[emit] " + event.id + ":pause ");
        socket.to(event.id).emit('pause', { finished: true });
        io.emit('nofifyPause', {eventId: event.id, finished: true});

        event.running = false;

        // check whether race is finished
        if (event.info.jumpoffNumber !== undefined) {
            if ((event.info.jumpoffNumber > 0 && event.realtime.lane === 2) || event.info.jumpoffNumber === 0) {
                console.log("[emit] " + event.id + ":final ");
                socket.to(event.id).emit('final', event.realtime);
                event.finalNo = event.realtime.num;
            }
        }
    }

    function processDNF(command) {
        // command { no, code }
        let event = getSocketEvent();
        if (event === false) {
            console.error("run command: failed.");
            return;
        }

        if (event.realtime.num === undefined) {
            console.error("run command: there is no number.");
            return;
        }

        // update status
        let updated = {};
        updated.num = command.num;
        updated.lane = event.realtime.lane;
        updated.score = event.realtime.score;

        let record;
        if (updated.lane === 1) {
            record = updated.score.lane1;
        } else {
            record = updated.score.lane2;
        }
        record.point = -command.code;

        event.realtime = {...event.realtime, ...updated };

        // alarm to client
        console.log("[emit] " + event.id + ":realtime(dnf) " + JSON.stringify(event.realtime));
        socket.to(event.id).emit('realtime', event.realtime);

        // paused
        console.log("[emit] " + event.id + ":pause ");
        socket.to(event.id).emit('pause', { finished: true });
        io.emit('nofifyPause', {eventId: event.id, finished: true});

        event.running = false;
    }

    function processAtStart(command) {
        // command.list
    }


    // cross process

    function getPlayer(event, num) {

        let player = event.players[num];

        if (player == undefined) {
            player = {
                num: num,
            };
            event.players[num.toString()] = player;
        }

        return event.players[num.toString()];
    }

    function processCrossSTART_I(command) {

        console.log("processCrossSTART_I started.");

        let event = getSocketEvent();
        if (event === false) {
            console.error("CrossSTART_I command: failed.");
            return;
        }

        event.players = {};
        event.sections = {
            start : [],
            live : [],
            finish : []
        }

    }

    function processCrossTI0(command) {
        
        console.log("processCrossTI0 started.");

        let event = getSocketEvent();
        if (event === false) {
            console.error("CrossTI0 command: failed.");
            return;
        }

        let player = getPlayer(event, command.num);

        // num, is_finish, course_time, passing_time, anonymouse_time
        player = {...player, ...command}; 

        event.players[command.num] = player;
    }

    function processCrossS(command) {
        console.log("processCrossS started.");

        let event = getSocketEvent();
        if (event === false) {
            console.error("CrossS command: failed.");
            return;
        }

        let section = command.section;

        if (section == 0) 
            event.sections.start = [];
        else if (section == 1)
            event.sections.live = [];

        for(let obj of command.list) {
            
            let num = obj.num;

            if (section == 0)
                event.sections.start.push(parseInt(num));
            else if (section == 1)
                event.sections.live.push(parseInt(num));
        }
    }
    
    function getLiveInfo(event) {

        let sync_time = parseInt(event.sync_time);

        if ((event.startlist.length && parseInt(event.startlist[0].start_time) == 0) || !sync_time) {

            return {
                players :   event.players,
                sections :  event.sections  
            }
        }


        event.sections.live = [];
        event.sections.start = [];

        /*
        event.sections.finish = [];
        for (let i = 1; i < event.ranking.length; i ++) {
            let rankentry = event.ranking[i];
            event.sections.finish.push(rankentry[1]);
        }
        */

        for (let startentry of event.startlist) {
            
            let start_time = parseInt(startentry.start_time);

            if (start_time > sync_time) {
                event.sections.start.push(startentry.num);
            } else {

                const rankentry = event.ranking.find(r2 => r2[1] === startentry.num);
                
                if (!rankentry)
                    event.sections.live.push(startentry.num);
            }
        }



        return {
            players :   event.players,
            sections :  event.sections  
        }
        
    }

    function processCrossR(command) {
        console.log("processCrossR started.");

        let event = getSocketEvent();
        if (event === false) {
            console.error("CrossR command: failed.");
            return;
        }

        for(let obj of command.list) {
            
            let num = obj.num;

            let player = getPlayer(event, num);

            player = {...player, ...obj}; // num, start_time

            event.players[num] = player;
        } 
        
        socket.to(event.id).emit('live_info', getLiveInfo(event));
    }

    function processCrossF(command) {
        console.log("processCrossF started.");

        let event = getSocketEvent();
        if (event === false) {
            console.error("CrossF command: failed.");
            return;
        }

        event.sections.finish = [];

        for(let obj of command.list) {
            
            let num = obj.num;

            event.sections.finish.push(parseInt(num));

            let player = getPlayer(event, num);

            player = {...player, ...obj}; // num, finish_time

            event.players[num] = player;

            player.num = obj.num;
        }
        
        socket.to(event.id).emit('live_info', getLiveInfo(event));

    }

    function processCrossSYNC(command) {
        let event = getSocketEvent();
        if(event === false) {
            console.error("CrossSYNC command: failed.");
            return ;
        }

        //console.log("*** SYNC packet");

        event.sync_time = command.sync_time;

        

        var lives = JSON.parse(JSON.stringify(event.sections.live));
        var live_info = getLiveInfo(event);

        if (lives.length != live_info.sections.live.length) 
        {
            socket.to(event.id).emit('live_info', live_info);
        }

        socket.to(event.id).emit('CrossSYNC', {sync_time:command.sync_time, course_points: command.list});
    }

    function processCrossEND_I(command) {

    }

    // when the user disconnects.. perform this
    function processExit(obj) {
        let event = getSocketEvent();
        if (event === false) {
            console.error("run command: failed.");
            return;
        }

        if (socket.eventId) {
            // remove from running events
            //events = events.filter(event => { return event.id !== socket.eventId; });

            let event = events.find((event) => {
                return event.id === socket.eventId;
            });
            event.realtime = {};

            // alarm to clients
            console.log("[emit] consumer:end " + socket.eventId);
            socket.to('consumer').emit('end', { id: socket.eventId });

            event.info.live = 0;
        }
    }
    // message processor


});