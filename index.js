'use strict'

require('dotenv').config()
const http = require('axios');
const fs = require('fs');
var path = require('path');
const fse = require('fs-extra');
const readline = require("readline");
const { get } = require('http');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Simple config class mock
class Config {
    constructor() {
        this.config = {
            consulUrl: process.env.CONSUL_URL,
            consulLocalFolder: (process.env.CONSUL_LOCAL_FOLDER || './consul'), //Default will be a folder named consul inside project
            consulBasePath: (process.env.CONSUL_LOCAL_FOLDER || '') //Default is consul root folder
        }
    }

    get = key => {
        if (this.config[key]) {
            return this.config[key]
        } else {
            throw new Error(`Key "${key}" hasn't been set!`)
        }
    }

}

const config = new Config();

const GREEN = '\x1b[32m%s\x1b[0m'
const YELLOW = '\x1b[33m%s\x1b[0m'
const RED = '\x1b[31m%s\x1b[0m'

const syncToDir = async () => {
    console.log('Starting...');
    console.log('Reseting local copy...');
    rimraf(config.get('consulLocalFolder'))
    console.log('Generating new local copy...');
    const keys = await getConsulPath(consul.get('consulBasePath'))
    for await (const pathAndValue of keys) {
        console.log(YELLOW, pathAndValue.Key);
        const path = await mapToDisk(pathAndValue)
        console.log(GREEN, path);
    }

    const res = flatTree(config.get('consulLocalFolder'))
    fs.writeFileSync('./tmp/prev.json', JSON.stringify(res))
    rl.close();
};


function flatTree(dir, result = {}) {
    const isDir = fs.lstatSync(dir).isDirectory();
    if (!isDir) {
        const fileData = fs.readFileSync(dir, 'utf8');
        result[dir.replace(config.get('consulLocalFolder'), '')] = fileData;
    } else {
        const folders = fs.readdirSync(dir);
        folders.forEach(folder => {
            //   console.log('Folder: ', dir + '/' + folder);
            return flatTree(dir + '/' + folder, result);
        });
    }
    return result;
}



const mapToDisk = async (pathAndValue) => {
    return new Promise(async (resolve, reject) => {
        try {
            const path = config.get('consulLocalFolder') + '/' + pathAndValue.Key;
            //Ignore empty folders
            if (path.endsWith('/')) {
                return resolve()
            }
            /*   if (fs.existsSync(path)) {
                   console.log('file exists');
               } else {*/
            let buff = new Buffer.from(pathAndValue.Value + "", 'base64');
            let dataFrom = buff.toString('ascii');
            await fse.outputFile(path, dataFrom)
            console.log('Done: ', path);
            resolve(path)
            //}
        } catch (error) {
            throw error
        }
    })
}

const getConsulPath = async path => {
    try {
        const options = {
            method: 'GET',
            url: `${consul.get('consulUrl')}${path}?dc=dc1&recurse=true`,
            data: {}
        };
        const { data } = await http.request(options);
        return data;

    } catch (error) {
        throw error;
    }
}

const setConsulPath = async (path, value) => {
    try {
        const options = {
            method: 'PUT',
            url: `${consul.get('consulUrl')}${path}`,
            data: value
        };
        const { data } = await http.request(options);
        console.log(GREEN, `Updated key: ${path} √`);
        return data;
    } catch (error) {
        console.log(RED, `Failed to updated key: ${path} x`);
        // throw error;
    }
}
const deleteConsulPath = async (path, value) => {
    try {
        const options = {
            method: 'DELETE',
            url: `${consul.get('consulUrl')}${path}`,
            data: value
        }
        const { data } = await http.request(options);
        console.log(YELLOW, `Deleted key: ${path} √`);
        return data;
    } catch (error) {
        console.log(RED, `Failed to delete key: ${path} x`);
        // throw error;
    }
}

const getChanged = (prev, next) => {
    const prevKeys = Object.keys(prev)
    const nextKeys = Object.keys(next)

    const diff = {};
    nextKeys.forEach(keyNext => {
        if (!prev[keyNext]) {
            diff[keyNext] = next[keyNext]
        } else if (next[keyNext] !== prev[keyNext]) {
            diff[keyNext] = next[keyNext]
        }
    })
    return diff
}

const getRemoved = (prev, next) => {
    const prevKeys = Object.keys(prev)
    const nextKeys = Object.keys(next)

    const diff = [];
    prevKeys.forEach(keyPrev => {
        if (!next[keyPrev]) {
            diff.push(keyPrev)
        }
    })
    return diff
}

const setChanges = () => {
    const res = flatTree(config.get('consulLocalFolder'))
    fs.writeFileSync('./tmp/next.json', JSON.stringify(res))
    const prev = fs.existsSync('./tmp/prev.json') ? JSON.parse(fs.readFileSync('./tmp/prev.json', 'utf8')) : {};
    const next = fs.existsSync('./tmp/next.json') ? JSON.parse(fs.readFileSync('./tmp/next.json', 'utf8')) : {};
    const changes = getChanged(prev, next);
    const changesRemove = getRemoved(prev, next);
    fs.writeFileSync('./tmp/updated-keys.json', JSON.stringify(changes))
    fs.writeFileSync('./tmp/deleted-keys.json', JSON.stringify(changesRemove))
    const changesKeys = Object.keys(changes);
    if (changesKeys.length === 0) {
        //console.log(YELLOW, 'There are no changes to be set!');
        return deleteKeys(changesRemove, prev);
    }
    console.log('The folowing keys were updated:');
    changesKeys.forEach(key => {
        console.log(GREEN, `Key: ${key} \nValue: ${changes[key]}\n`);
    })

    rl.question(`Do you whant to update the listed keys on: ${config.get('consulUrl')}? (type "yes" to continue)`, async function (sync) {
        if (sync === "yes") {
            console.log(YELLOW, `Applying changes...`);
            for await (let key of changesKeys) {
                await setConsulPath(key, changes[key]);
            }
            return deleteKeys(changesRemove, prev);
        } else {
            console.log('Changes will be ignored...');
            return deleteKeys(changesRemove, prev);
        }
    });
}

const deleteKeys = (changesRemove, prev) => {
    //Deleted keys
    if (changesRemove.length === 0) {
        rl.close();
        return 0;
    }

    console.log('The folowing keys were removed:');
    changesRemove.forEach(key => {
        console.log(RED, `Key: ${key} \nValue: ${prev[key]}\n`);
    })

    rl.question(`Are you sure you whant to delete the listed keys on: ${config.get('consulUrl')}?  (type "yes" to continue)`, async function (sync) {
        if (sync === "yes") {
            console.log(RED, `Deleting keys...`);
            for await (let key of changesRemove) {
                await deleteConsulPath(key);
            }
        } else {
            console.log('Delete ignored...');
        }
        rl.close();
    });
    // End delete
}

rl.on("close", function () {
    //console.log("\nBYE BYE !!!");
    process.exit(0);
});


// File tree delete
const rimraf = dir_path => {
    if (fs.existsSync(dir_path)) {
        fs.readdirSync(dir_path).forEach(function (entry) {
            var entry_path = path.join(dir_path, entry);
            if (fs.lstatSync(entry_path).isDirectory()) {
                rimraf(entry_path);
            } else {
                fs.unlinkSync(entry_path);
            }
        });
        fs.rmdirSync(dir_path);
    }
}

const bootstrap = () => {
    if (!fs.existsSync(config.get('consulLocalFolder'))) {
        fs.mkdirSync(config.get('consulLocalFolder'))
    }
}

try {
    bootstrap()
    var myArgs = process.argv.slice(2);
    switch (myArgs[0]) {
        case "get":
            syncToDir()
            break;

        case "set":
            setChanges()
            break;

        default:
            console.error('Invalid option!')
            rl.close();
            break;
    }

} catch (error) {
    console.log(RED, '\n\nUps, somthing went wrong...');
    console.log('Error: \n', error);
    rl.close();
}