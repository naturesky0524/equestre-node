const labels = ["CLASSFIED", "NOT_PRESENT", "NOT_STARTED", "RETIRED", "ELIMINATED", "OFF_COURSE", "DISQUALIFIED"];

const TABLE_A = 0;
const TABLE_C = 1;
const TABLE_PENALTIES = 2;
const TABLE_OPTIMUM = 10;

function generateRanking(roundScore, jumpoffScore,
    roundCount, jumpoffCount,
    round, jumpoff,
    roundTableTypes, jumpoffTableTypes,
    allowedTimeRounds, allowedTimeJumpoffs,
    againstTimeClockRounds, againstTimeClockJumpoffs,
    twoPhaseIntegrated, twoPhaseDiffered, discipline) {
    
    if (twoPhaseIntegrated) {
        round = 0;
        jumpoff = 1;
    } else if (twoPhaseDiffered) {
        //round = 0;
        //jumpoff = 0;
    }

    twoPhaseIntegrated = twoPhaseIntegrated || twoPhaseDiffered;

    let roundDisplayCount = round !== 0 ? round : (roundCount + jumpoff);
    if (twoPhaseDiffered) roundDisplayCount = roundCount;
    const scoreList = [...roundScore.slice(0, roundCount), ...jumpoffScore.slice(0, jumpoffCount)];
    const tableTypeList = [...roundTableTypes.slice(0, roundCount), ...jumpoffTableTypes.slice(0, jumpoffCount)];
    const allowedTimesList = [...allowedTimeRounds.slice(0, roundCount), ...allowedTimeJumpoffs.slice(0, jumpoffCount)];
    const againstTimeClockList = [...againstTimeClockRounds.slice(0, roundCount), ...againstTimeClockJumpoffs.slice(0, jumpoffCount)];
    const columnCount = 5 + 2 * roundDisplayCount;
    let riderCount = scoreList[0].length;

    for (let i = 1; i < roundDisplayCount; i ++) {
        if (scoreList[i].length > riderCount) {
            riderCount = scoreList[i].length;
        }
    }

    // format result table
    let result = Array(riderCount + 1).fill(0).map(() => Array(columnCount).fill(''));

    // format result table header
    result[0][0] = `<span data-key="RANK"></span>`;
    result[0][1] = `<span data-key="NUMBER"></span>`;
    result[0][2] = `<span data-key="HORSE"></span>`;
    result[0][3] = `<span data-key="RIDER"></span>`;
    result[0][4] = `<span data-key="NATION"></span>`;
    for (let i = 0; i < roundDisplayCount; i++) {
        const roundType = i < roundCount ? 'ROUND' : 'JUMP_OFF';
        const tableType = tableTypeList[i];
        const pointType = tableType === TABLE_C ? 'PENALTIES' : 'POINTS';
        const ii = i < roundCount ? `${i + 1}` : `${i + 1 - roundCount}`;
        const fontSize = roundType === 'ROUND' ? 'font-size-small' : 'font-size-mini';
        if (discipline == 3/*Dressage*/) {
            const timeStr = '<div class="font-size-small">%</div>';
            result[0][5 + i * 2 + 1] = `<div class="${fontSize} no-wrap"><span data-key="${roundType}">${roundType}</span> ${ii}</div><div data-key="${pointType}" class="font-size-small"></div>`;
            result[0][5 + i * 2] = `<div class="${fontSize} no-wrap"><span data-key="${roundType}">${roundType}</span> ${ii}</div>${timeStr}`;
    
        } else {
            const timeStr = '<div class="font-size-small" data-key="TIME">Time</div>';
            result[0][5 + i * 2] = `<div class="${fontSize} no-wrap"><span data-key="${roundType}">${roundType}</span> ${ii}</div><div data-key="${pointType}" class="font-size-small"></div>`;
            result[0][5 + i * 2 + 1] = `<div class="${fontSize} no-wrap"><span data-key="${roundType}">${roundType}</span> ${ii}</div>${timeStr}`;    
        }
    }

    // calculate ranking
    let resultNums = [];
    for (let i = roundDisplayCount - 1; i >= 0; i --) {
        const tableSlice = scoreList[i]
            .filter(s => {
                const num = s.num;
                const found = resultNums.find(r => r[1] === num);
                return !found;
            }).map(s => ({...s}));
        if (i >= 1 && i < roundCount - 1) {
            for (let j = 0; j < tableSlice.length; j ++) {
                tableSlice[j].point = 0;
                tableSlice[j].pointPlus = 0;
            }
            for (let j = 0; j <= i; j ++) {
                const table = scoreList[j];
                for (let k = 0; k < tableSlice.length; k ++) {
                    const num = tableSlice[k].num;
                    const found = table.find(t => t.num === num);
                    if (!found) { continue; }
                    tableSlice[k].point += found.point;
                }
            }
        }

        // update by liuda
        if (twoPhaseDiffered) {
            for (let k = 0; k < tableSlice.length; k ++) {
                tableSlice[k].point = 0;
                tableSlice[k].time = 0;
            }
            for (let j = 0; j <= i; j ++) {
                const table = scoreList[j];
                for (let k = 0; k < tableSlice.length; k ++) {
                    const num = tableSlice[k].num;
                    const found = table.find(t => t.num === num);
                    if (!found) { continue; }
                    tableSlice[k].point += found.point;

                    if (againstTimeClockList[j])
                        tableSlice[k].time += found.time;
                }
            }
        }


        let applyAgainstTimeClock = false;
        // if (jumpoffCount === 0 || (jumpoffCount >= 1 && i >= roundCount) || roundCount === round) {
        applyAgainstTimeClock = againstTimeClockList[i];
        // }
        const sortResult = discipline != 3 ? sortTable(tableSlice, tableTypeList[i], applyAgainstTimeClock, allowedTimesList[i]) : sortTableDressage(tableSlice, tableTypeList[i], applyAgainstTimeClock, allowedTimesList[i]);
        sortResult.forEach(s => {
            s[0] = s[0] + resultNums.length;
        });
        resultNums = [...resultNums, ...sortResult];
    }

    // write result table
    for (let i = 0; i < riderCount; i++) {
        const [rank, num] = resultNums[i];
        result[i + 1][0] = rank + 1;
        result[i + 1][1] = num;

        if (discipline == 3/*dressage*/) {
            const score = scoreList[0].find(s => s.num === num);
            result[i + 1][7] = score.judgeScores;
        }
        
        let displayRank = true;
        let scoreSummary = 0;
        let timeSummary = 0;
        for (let j = 0; j < roundDisplayCount; j++) {
            const score = scoreList[j].find(s => s.num === num);
            const roundType = tableTypeList[j];
            if (!score) { continue; }
            if (roundType === TABLE_OPTIMUM) {
                const optimumTime = allowedTimesList[j];
                result[i + 1][5 + j * 2 + 2] = (score.point > -10 && score.point < 0) ? '' : formatFloat(Math.abs(score.time - optimumTime) / 1000, 2, 'floor');
            }
            result[i + 1][5 + j * 2] = formatPoint(score.point, score.pointPlus, roundType);
            result[i + 1][5 + j * 2 + 1] = formatTime(score.point, score.time, 0, discipline);
            if (score.point >= 0) {
                // displayRank = true;
                scoreSummary += score.point;
            }
            if (againstTimeClockList[j])
                timeSummary += score.time;
        }
        if (!displayRank) { result[i + 1][0] = ''; }
        if (round > 1 && round <= roundCount) {
            result[i + 1][5 + (roundDisplayCount - 1) * 2 + 2] = displayRank ? formatPoint(scoreSummary, 0, TABLE_A) : '';
        }

        // update by liuda
        if (roundDisplayCount >= 2 && jumpoffCount == 0) { // && twoPhaseDiffered
            result[i + 1][5 + (roundDisplayCount - 1) * 2 + 2] = formatPoint(scoreSummary, 0, TABLE_A);
            result[i + 1][6 + (roundDisplayCount - 1) * 2 + 2] = formatTime(scoreSummary, timeSummary, 0, discipline);
        }
    }

    // update table header
    if (round > 1 && round <= roundCount) {
        result[0][5 + (roundDisplayCount - 1) * 2 + 2] = `<span data-key="POINTS"></span>`;
    }
    if (round === 1 && !twoPhaseDiffered) {
        const tableType = tableTypeList[0];
        const pointType = tableType === TABLE_C ? 'PENALTIES' : 'POINTS';

        if (discipline != 3) {
            result[0][5] = `<span data-key="${pointType}"></span>`;
            result[0][6] = `<span data-key="TIME"></span>`;    
        } else {
            result[0][6] = `<span data-key="${pointType}"></span>`;
            result[0][5] = `<span>%</span>`;    
        }
    }

    // update by liuda
    if (roundDisplayCount >= 2 && jumpoffCount == 0) { //  && twoPhaseDiffered
        const tableType = tableTypeList[0];
        const pointType = tableType === TABLE_C ? 'TOTAL PENALTIES' : 'TOTAL_POINTS';
        result[0][5 + (roundDisplayCount - 1) * 2 + 2] = `<span data-key="${pointType}"></span>`;
        result[0][6 + (roundDisplayCount - 1) * 2 + 2] = `<span data-key="TOTAL_TIME"></span>`;
    }
    
    const iRound = roundDisplayCount - 1;
    const tableType = roundTableTypes[iRound];

    if (roundTableTypes[iRound] === TABLE_OPTIMUM) {
        result[0][7] = `<span data-key="TIME_DIFF"></span>`;
    }

    // calculate game info
    const allowedTime = againstTimeClockList[iRound] ? allowedTimesList[iRound] : 0;
    const registeredCount = riderCount;
    let rankingCount = 0;
    let startedCount = 0;
    let clearedCount = 0;
    let expeledCount = 0;
    let comingUpCount = 0; // TODO:
    for (let i = 0; i < result.length; i++) {
        if (parseInt(result[i][0]) >= 0) {
            rankingCount ++;
        }
    }
    const currentRound = scoreList[iRound];
    for (let i = 0; i < currentRound.length; i++) {
        if (currentRound[i].point === 0 && currentRound[i].time !== 0) {
            clearedCount ++;
        }
        if (currentRound[i].point < 0) {
            expeledCount ++;
        }
    }
    startedCount = currentRound.length;
    comingUpCount = startedCount - clearedCount - expeledCount;

    if (discipline == 3) {
        result = result.reverse();
        result.unshift(result.pop());

        let maxRank = -1;
        for (let k = 1; k < result.length; k ++) {
            if (result[k][0] > maxRank) maxRank = result[k][0]; 
        }

        for (let k = 1; k < result.length; k ++) {
            result[k][0] = maxRank - result[k][0] + 1;
        }
    }

    return [result, {
        allowed_time: twoPhaseIntegrated ? allowedTimesList[0] : allowedTime,
        allowed_time_jumpoff: twoPhaseIntegrated ? allowedTimesList[1] : 0,
        registered_count: registeredCount,
        ranking_count: rankingCount,
        started_count: startedCount,
        cleared_count: clearedCount,
        comingup_count: comingUpCount,
        table_type: tableType,
        two_phase: twoPhaseIntegrated,
    }];
}

function sortTable(scoreTableSlice, tableType, applyAgainstTimeClock, optimumTime) {

    let scoreTable = scoreTableSlice.slice();
    const cnt = scoreTable.length;
    let result = Array(cnt).fill([0, 0]);
    let rankCounter = 0;
    let lastMax;
    for (let i = 0; i < cnt; i++) {
        let max = scoreTable[0];
        let iMax = 0;
        const n = scoreTable.length;
        for (let j = 1; j < n; j++) {
            const compareResult = compareFn(max, scoreTable[j], tableType, applyAgainstTimeClock, optimumTime);
            if (compareResult === -1) {
                max = scoreTable[j];
                iMax = j;
            }
        }
        if (i === 0) {
            result[i] = [0, max.num];
        } else {
            const compareResult = compareFn(max, lastMax, tableType, applyAgainstTimeClock, optimumTime);
            if (compareResult === -1) {
                rankCounter = i;
            }
            result[i] = [rankCounter, max.num];
        }
        lastMax = max;
        scoreTable.splice(iMax, 1);
    }
    return result;
}

function sortTableDressage(scoreTableSlice, tableType, applyAgainstTimeClock, optimumTime) {

    let scoreTable = scoreTableSlice.slice();
    const cnt = scoreTable.length;
    let result = Array(cnt).fill([0, 0]);
    let rankCounter = 0;
    let lastMax;
    for (let i = 0; i < cnt; i++) {
        let max = scoreTable[0];
        let iMax = 0;
        const n = scoreTable.length;
        for (let j = 1; j < n; j++) {
            const compareResult = compareFnDressage(max, scoreTable[j], tableType, applyAgainstTimeClock, optimumTime);
            if (compareResult === -1) {
                max = scoreTable[j];
                iMax = j;
            }
        }
        if (i === 0) {
            result[i] = [0, max.num];
        } else {
            const compareResult = compareFnDressage(max, lastMax, tableType, applyAgainstTimeClock, optimumTime);
            if (compareResult === -1) {
                rankCounter = i;
            }
            result[i] = [rankCounter, max.num];
        }
        lastMax = max;
        scoreTable.splice(iMax, 1);
    }
    return result;
}

function compareFn(score1, score2, tableType, applyAgainstTimeClock, optimumTime) {
    const pointA = score1.point;
    const pointB = score2.point;
    const timeA = score1.time;
    const timeB = score2.time;
    // if (timeA === 0) { return -1; }
    // if (timeB === 0) { return 1; }
    // if (timeA === timeB && timeA === 0) { return 0; }
    switch (tableType) {
        case TABLE_A: { // Table A
            // least point and fastest time
            if (score1.point < 0 && score2.point < 0) {
                if (score1.point === score2.point) {
                    return 0;
                }
                if (Math.abs(score1.point) > Math.abs(score2.point)) {
                    return 1;
                }
                return -1;
            }
            if (score1.point < 0) { return -1; }
            if (score2.point < 0) { return 1; }
            if (pointA < pointB) { return 1; }
            else if (pointA === pointB) {
                if (!applyAgainstTimeClock) { return 1; }
                if (timeA < timeB) { return 1; }
                else if (timeA === timeB) { return 0; }
                else { return -1; }
            }
            else { return -1; }
        }
        case TABLE_C: { // Table C
            // fastest time
            if (score1.point < 0 && score2.point < 0 && score1.point > -10 && score2.point > -10) {
                // when the point represents the status of the rider
                if (score1.point === score2.point) {
                    return 0;
                }
                if (Math.abs(score1.point) > Math.abs(score2.point)) {
                    return 1;
                }
                return -1;
            }
            if (score1.point < 0 && score1.point > -10) { return -1; }
            if (score2.point < 0 && score2.point > -10) { return 1; }

            if (timeA < timeB) { return 1; }
            else if (timeA === timeB) { return 0; }
            else { return -1; }
        }
        case TABLE_PENALTIES: { // Table Penalties
            if (score1.point < 0 && score2.point < 0 && score1.point > -10 && score2.point > -10) {
                // when the point represents the status of the rider
                if (score1.point === score2.point) {
                    return 0;
                }
                if (Math.abs(score1.point) > Math.abs(score2.point)) {
                    return 1;
                }
                return -1;
            }
            if (score1.point < 0 && score1.point > -10) { return -1; }
            if (score2.point < 0 && score2.point > -10) { return 1; }
            if (pointA > pointB) { return 1; }
            else if (pointA === pointB) {
                if (!applyAgainstTimeClock) { return 1; }
                if (timeA < timeB) { return 1; }
                else if (timeA === timeB) { return 0; }
                else { return -1; }
            }
            else { return -1; }
        }
        case TABLE_OPTIMUM: { // Table Optimum
            if (score1.point < 0 && score2.point < 0) {
                if (score1.point === score2.point) {
                    return 0;
                }
                if (Math.abs(score1.point) > Math.abs(score2.point)) {
                    return 1;
                }
                return -1;
            }
            if (score1.point < 0) { return -1; }
            if (score2.point < 0) { return 1; }
            if (pointA < pointB) { return 1; }
            else if (pointA === pointB) {
                const timeDiffA = Math.abs(timeA - optimumTime);
                const timeDiffB = Math.abs(timeB - optimumTime);
                if (timeDiffA < timeDiffB) { return 1; }
                else if (timeDiffA === timeDiffB) { return 0; }
                else { return -1; }
            }
            else { return -1; }
        }
        default: {
            return 0;
        }
    }
}

function compareFnDressage(score1, score2, tableType, applyAgainstTimeClock, optimumTime) {
    const pointA = score1.point;
    const pointB = score2.point;
    const timeA = score1.time;
    const timeB = score2.time;
    // if (timeA === 0) { return -1; }
    // if (timeB === 0) { return 1; }
    // if (timeA === timeB && timeA === 0) { return 0; }

    // least point and fastest time

    if (pointA < pointB) { return 1; }
    else if (pointA === pointB) {
        if (!applyAgainstTimeClock) { return 1; }
        if (timeA < timeB) { return 1; }
        else if (timeA === timeB) { return 0; }
        else { return -1; }
    }
    else { return -1; }
}

function formatFloat(point, digit, round) {
    digit = (digit > 5)?5:digit;
    digit = (digit < 0)?0:digit;

    let pos = Math.pow(10, digit);
    if(round==='round') {
        point = Math.round(point * pos);
    } else if(round ==='ceil') {
        point = Math.ceil(point * pos);
    } else if(round==='floor') {
        point = Math.floor(point * pos);
    }
    return (point / pos).toFixed(digit);
}

function formatPoint(score, pointSurpassing, roundType) {
    if (score > -10 && score < 0) {
        const label = labels[Math.abs(score) - 1];
        return `<span class="point-label" data-key="${label}">${label}</span>`;
    }
    const s1 = formatFloat(score / 1000, 2, 'floor');
    const s2 = formatFloat(pointSurpassing / 1000, 2, 'floor');
    if (pointSurpassing !== 0) {
        // TODO: comment/uncomment if needed
        return `${s1} <span class="font-point-surpassing">(${s2})</span>`;
    }
    if (roundType === TABLE_C) {
        if (score !== 0) {
            return `(${s1})`;
        } else {
            return '';
        }
    }
    return s1;
}

function formatTime(point, time, timePenalty, discipline) {

    if (discipline == 3)
        return formatFloat(time / 1000, 2, 'floor');

    if (point > -10 && point < 0) {
        return '';
    }
   //const s1 = formatFloat(time / 1000, 2, 'floor');
   let s1 = "";

    if (discipline == 0)
        s1 = formatFloat(time / 1000, 2, 'floor');
    else if (discipline == 2)
        s1 = tickToTimeD(time);

   const s2 = formatFloat(timePenalty / 1000, 2, 'floor');
   if (timePenalty !== 0) {
       return `${s1} <span class="font-point-surpassing">(${s2})</span>`;
   }
   return s1;
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

module.exports = { generateRanking };