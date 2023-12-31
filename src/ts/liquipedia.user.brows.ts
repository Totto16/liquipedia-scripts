// ==UserScript==
// @name         liquipedia scripts
// @namespace    Totto
// @version      1.0.1
// @description  Some liquipedia scripts
// @author       Totto
// @compatible   firefox
// @run-at       document-end
// @grant        GM.addStyle
// @grant        GM.xmlHttpRequest
// @grant        window.close
// @grant        window.focus
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.listValues
// @grant        GM.openInTab
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_setClipboard
// @grant        GM.registerMenuCommand
// @grant        GM.unregisterMenuCommand
// @grant        GM.notification
// @match        *://liquipedia.net/*
// @inject-into  page
// @downloadURL  http://127.0.0.1:3345/addons/downloader.user.js
// @updateURL    http://127.0.0.1:3345/addons/downloader.user.js
// ==/UserScript==

import { ignore, waitFor } from './common';

async function ready(callback: () => void | Promise<void>, fully = false) {
    // in case the document is already rendered
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        if (fully === true) {
            if (document.readyState === 'interactive') {
                waitFor(() => document.readyState === 'complete')
                    .then(callback)
                    .catch(ignore);
                return;
            }
        }
        await callback();
    }
    // modern browsers
    else if ((document as { addEventListener?: unknown }).addEventListener !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        document.addEventListener('DOMContentLoaded', async () => {
            await callback();
        });
    } else {
        // IE <= 8
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        (document as unknown as { attachEvent: (type: string, listener: () => void) => void }).attachEvent('onreadystatechange', async function () {
            if (document.readyState === 'complete') {
                await callback();
            }
        });
    }
}

type Place = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

type TeamPlace = Place | 'DNQ' | -1;

type PointsObject = {
    [key in Place]: number;
};

interface Tournament<P = PointsObject> {
    name: string;
    points: P;
}

interface Team {
    name: string;
    places: TeamPlace[];
    points: number;
    place: number;
}

interface PGCSite {
    tournaments: Tournament[];
    teams: Team[];
}

function getPlace(pointObject: PointsObject, points: number): TeamPlace {
    if (points === 0) {
        return -1;
    }
    for (const [key, value] of Object.entries(pointObject)) {
        if (value === points) {
            return parseInt(key) as TeamPlace;
        }
    }

    throw new Error(`Couldn't map placement points to place: ${points} Points`);
}

function parsePGCSite(alreadyPlayedTournaments: number): PGCSite {
    const tables = document.querySelectorAll('.wikitable');
    if (tables.length !== 2) {
        throw new Error('table amount not correct, did the site change?');
    }
    const [teamTable, tournamentTable] = Array.from(tables);

    const tournamentRows: Element[] = Array.from(tournamentTable.querySelectorAll('tr'));

    const tempTournaments = Array.from(tournamentRows[0].querySelectorAll('th'));
    tempTournaments.splice(0, 1);

    const partialTournaments: Tournament<Partial<PointsObject>>[] = tempTournaments.map((element) => ({
        name: element.textContent?.trim() ?? '',
        points: {},
    }));

    tournamentRows.splice(0, 1);

    for (let i = 0; i < tournamentRows.length; ++i) {
        const row = tournamentRows[i];
        const columns = row.querySelectorAll('td');
        const [_, ..._points] = Array.from(columns);

        for (let j = 0; j < _points.length; ++j) {
            const points: number = parseInt(_points[j]?.textContent?.trim() ?? '-1');
            const place: Place = (i + 1) as Place;
            partialTournaments[j].points[place] = points;
        }
    }

    const tournaments: Tournament[] = partialTournaments as Tournament[];

    const teamRows: Element[] = Array.from(teamTable.querySelectorAll('tr'));
    teamRows.splice(0, 1);

    const teams: Team[] = [];
    for (const row of teamRows) {
        const columns = row.querySelectorAll('td');
        const [_place, _name, ..._tournaments] = Array.from(columns);

        const place: number = parseInt(_place.textContent?.trim() ?? '-1');
        const name: string = _name.textContent?.trim() ?? '';

        const _totalPoints: number = parseInt(_tournaments.at(-1)?.textContent?.trim() ?? '-1');

        let realTotalPoints = 0;

        for (let i = 0; i < alreadyPlayedTournaments; ++i) {
            const pointsText = _tournaments[i].textContent?.trim() ?? 'DNQ';

            const points: number = pointsText === 'DNQ' ? 0 : parseInt(pointsText);
            realTotalPoints += points;
        }

        const places: TeamPlace[] = [];

        for (let i = 0; i < _tournaments.length - 1; ++i) {
            const pointsText = _tournaments[i].textContent?.trim() ?? 'DNQ';

            const teamPlace: TeamPlace = pointsText === 'DNQ' ? 'DNQ' : getPlace(tournaments[i].points, parseInt(pointsText));
            places.push(teamPlace);
        }

        const localTeam: Team = { name, places, points: realTotalPoints, place };
        teams.push(localTeam);
    }

    return {
        teams,
        tournaments,
    };
}

function getPGCTeamByName(teams: Team[], name: string): Team {
    for (const team of teams) {
        if (team.name === name) {
            return team;
        }
    }

    throw new Error(`No team with name: ${name}`);
}

function generateCPP(tournament: Tournament, teams: Team[]): string {
    const autogen = '// AUTO GENERATED BY TS (JS)';

    let insertIntoMap = '';
    for (const [key, value] of Object.entries(tournament.points)) {
        insertIntoMap += `        points.insert_or_assign(static_cast<Place>(${+key - 1}), static_cast<Points>(${value}));
`;
    }

    let teamsInsert = '';
    for (let i = 0; i < teams.length; ++i) {
        const team = teams[i];

        let placesInsert = '';
        for (let j = 0; j < team.places.length; ++j) {
            let place = team.places[j];
            if (place === 'DNQ' || place < 0) {
                place = 17 as TeamPlace;
            }
            placesInsert += `
            
            places_${i}[${j}] = ${place};
            `;
        }

        teamsInsert += `

        std::array<TeamPlace, TOURNAMENT_AMOUNT> places_${i}{};

        ${placesInsert}

        
        const Team<TOURNAMENT_AMOUNT> team_${i} = Team<TOURNAMENT_AMOUNT>{"${team.name}", places_${i}, ${team.points}, ${team.place}};
        teams[${i}] = team_${i};


        `;
    }

    return `
    #include <teams.hpp>

    Tournament get_current_tournament(){

        ${autogen}
        
        
        PointsObject points = PointsObject{};

        ${insertIntoMap}

        std::string name = "${tournament.name}"; 

        Tournament tournament = {
            name,
            points
        };
        
        return tournament;
    
        ${autogen}
        
        }

         // constexpr uint8_t TOURNAMENT_AMOUNT =  ${teams[0].places.length}; 
         // constexpr uint8_t AMOUNT = ${teams.length}; 
        
        std::array<Team<TOURNAMENT_AMOUNT>, AMOUNT> get_current_teams() {
            ${autogen}
            std::array<Team<TOURNAMENT_AMOUNT>, AMOUNT> teams{};


            ${teamsInsert}

        
            return teams;
            ${autogen}
        }
        
        
        
        
        `;
}

function calculatePGCPoints(alreadyPlayedTournaments: number): void {
    try {
        const siteInfo = parsePGCSite(alreadyPlayedTournaments);
        console.log(siteInfo);
        const qualifiedTeams: Team[] = siteInfo.teams.filter((team) => {
            const place = team.places[alreadyPlayedTournaments];
            return place !== 'DNQ' && place >= 1;
        });
        const activeTournament = siteInfo.tournaments[alreadyPlayedTournaments];
        // just to tests

        console.log(generateCPP(activeTournament, siteInfo.teams));
    } catch (exception) {
        console.error(exception);
        console.log('Error in parsing PGC site');
    }
}

function detectPage(): void {
    switch (location.pathname) {
        case '/pubg/PUBG_Global_Championship/2023/EMEA/Points':
            calculatePGCPoints(2);
            break;
        default:
            return;
    }
}

void ready(() => {
    detectPage();
});
