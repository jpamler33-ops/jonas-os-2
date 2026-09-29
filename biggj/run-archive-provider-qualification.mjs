import {writeFile} from 'node:fs/promises';import {qualifyArchiveProviders} from './archive-provider-qualification.mjs';
const report=await qualifyArchiveProviders();await writeFile('biggj-archive-provider-qualification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
