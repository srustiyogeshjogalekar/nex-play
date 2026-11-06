
import {describe,it,expect,beforeEach} from 'vitest';
import {formatTime,remainingTime,completionStatus,nextSpeed,progressPercent,saveProgress,loadProgress,SPEEDS} from '../src/player.js';
const store=()=>{let d={};return {setItem:(k,v)=>d[k]=v,getItem:k=>d[k]??null,removeItem:k=>delete d[k]}};
describe('NexPlay player utilities',()=>{
 it('formats times in mm:ss and hh:mm:ss',()=>{expect(formatTime(65)).toBe('1:05');expect(formatTime(3661)).toBe('1:01:01');expect(formatTime(-1)).toBe('0:00')});
 it('calculates remaining time',()=>expect(remainingTime(100,25)).toBe('-1:15'));
 it('marks completion at configured threshold',()=>{expect(completionStatus(90,100)).toBe(true);expect(completionStatus(89,100)).toBe(false);expect(completionStatus(0,0)).toBe(false)});
 it('cycles through supported playback speeds',()=>{expect(SPEEDS).toEqual([.5,1,1.25,1.5,2]);expect(nextSpeed(1)).toBe(1.25);expect(nextSpeed(2)).toBe(.5)});
 it('clamps progress percentage',()=>{expect(progressPercent(50,100)).toBe(50);expect(progressPercent(120,100)).toBe(100);expect(progressPercent(-2,100)).toBe(0);expect(progressPercent(2,0)).toBe(0)});
 it('saves and resumes progress',()=>{const s=store();saveProgress('v1',42,100,s);expect(loadProgress('v1',s)).toBe(42)});
 it('uses the configured completion threshold when saving progress',()=>{const s=store();saveProgress('v1',82,100,s,80);expect(loadProgress('v1',s)).toBe(0)});
 it('does not resume completed video',()=>{const s=store();saveProgress('v1',95,100,s);expect(loadProgress('v1',s)).toBe(0)});
 it('handles invalid stored JSON safely',()=>{const s=store();s.setItem('nexplay-progress-v1','broken');expect(loadProgress('v1',s)).toBe(0)});
});
