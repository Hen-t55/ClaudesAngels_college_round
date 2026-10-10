import { describe, it, expect } from 'vitest';
import { PoseRecorder, PoseReplayer, PoseRecordFrame } from '../../src/sidepanel/vision/PoseRecorder';

describe('PoseRecorder & PoseReplayer', () => {
  it('records pose frames, exports to JSON, and replays identically', () => {
    const recorder = new PoseRecorder();

    recorder.startRecording(1000);
    recorder.recordFrame(0.01, -0.02, 0.0, true, 0.95, 1000);
    recorder.recordFrame(0.05, -0.01, 0.0, true, 0.95, 1033);
    recorder.recordFrame(0.12, 0.04, 0.0, true, 0.95, 1066);

    const jsonStr = recorder.exportJSON(1100);
    expect(jsonStr).toContain('"version": "1.0"');

    const replayer = new PoseReplayer();
    const loaded = replayer.loadJSON(jsonStr);
    expect(loaded).toBe(true);

    const replayedFrames: PoseRecordFrame[] = [];
    replayer.play((frame) => {
      replayedFrames.push(frame);
    });

    const session = replayer.getSession();
    expect(session?.frames.length).toBe(3);
    expect(session?.frames[0].pitch).toBe(0.01);
    expect(session?.frames[2].pitch).toBe(0.12);
  });
});
