// Offline operator command; SQLite backup includes committed WAL records. Never copy only the live .sqlite file.
import {DatabaseSync,backup} from 'node:sqlite';
import {access} from 'node:fs/promises';
const [source,destination]=process.argv.slice(2);
if(!source||!destination||source===destination)throw Error('Provide distinct source and NEW backup paths.');
await access(source);
try{await access(destination);throw Error('Destination already exists; preserve it.');}catch(e){if(e.code!=='ENOENT')throw e;}
const db=new DatabaseSync(source);
try{await backup(db,destination);console.log('Shared index backup completed.');}finally{db.close();}
