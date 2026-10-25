function acceptanceStatus(record) {
 if(record.status==='unsupported')return 'unsupported';
 if(!record.final)return 'generation-fail';
 const schema=Object.values(record.sdk?.final||{});
 if(schema.some(s=>s.status==='fail'||s.status==='error'))return 'schema-fail';
 if(record.status==='fail')return 'fidelity-or-integrity-fail';
 if(schema.length!==2||schema.some(s=>s.status!=='pass'))return 'schema-pending';
 return 'word-pending';
}
module.exports={acceptanceStatus};
