// Presence/format only. Never prints secret values, lengths, fragments or decoded claims.
import { pinataCredentialAvailable } from '../src/lib/pinata-metadata-storage.ts';
const configured=pinataCredentialAvailable(process.env.PINATA_JWT);
console.log(JSON.stringify({runtime:process.env.CODESPACES==='true'?'Codespaces':'current process (not identified as Codespaces)',PINATA_JWT:configured?'present; JWT format valid':process.env.PINATA_JWT?'present; wrong format':'absent',provider:process.env.JEET_METADATA_STORAGE==='pinata'?'pinata':'not enabled',liveVerification:false},null,2));
if(!configured)process.exitCode=2;
