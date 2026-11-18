/* global AudioWorkletProcessor, registerProcessor */
class SalesVoiceCapture extends AudioWorkletProcessor {
  process(inputs) {
    const frame = inputs[0]?.[0];
    if (frame) {
      const copy = frame.slice();
      this.port.postMessage(copy, [copy.buffer]);
    }
    return true;
  }
}
registerProcessor('sales-voice-capture', SalesVoiceCapture);
