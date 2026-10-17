// Prints a hash only; use via trusted local tooling, never send the password to logs.
import {passwordHash} from '../lib/password-auth.mjs';
let input='';for await(const chunk of process.stdin)input+=chunk;
const password=input.trimEnd();
if(password.length<16||password.length>256)throw Error('Use a password of 16 to 256 characters');
console.log(await passwordHash(password));
