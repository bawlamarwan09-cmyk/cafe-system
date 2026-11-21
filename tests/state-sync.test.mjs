import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStateSync} from '../lib/state-sync.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

test('overlapping refreshes share one request; action invalidation rejects stale poll state',async()=>{
 const sync=createStateSync(),old=deferred();let requests=0;const applied=[];
 const one=sync.read('today',()=>{requests++;return old.promise;},value=>applied.push(value));
 const two=sync.read('today',()=>{requests++;},value=>applied.push(value));
 assert.equal(one,two);await Promise.resolve();assert.equal(requests,1);
 sync.invalidate();applied.push('committed action');
 const three=sync.read('today',async()=>'fresh state',value=>applied.push(value));
 await three;old.resolve('old state');await one;
 assert.deepEqual(applied,['committed action','fresh state']);assert.equal(sync.pending,false);
});

test('a previous date or failed stale poll cannot overwrite or log out the current state',async()=>{
 const sync=createStateSync(),old=deferred(),current=deferred();const applied=[];
 const previous=sync.read('yesterday',()=>old.promise,value=>applied.push(value));
 const latest=sync.read('today',()=>current.promise,value=>applied.push(value));
 old.reject(new Error('stale 401'));await previous;assert.equal(sync.pending,true);
 current.resolve('today');await latest;assert.deepEqual(applied,['today']);
 await assert.rejects(sync.read('today',async()=>{throw new Error('real 401');},()=>{}),/real 401/);
});
