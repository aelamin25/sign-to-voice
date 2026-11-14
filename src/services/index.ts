import { isMock, type ServiceName } from "../app/config";
import { createMockAvatar, createRealAvatar } from "./avatar";
import { createMockRecognition, createRealRecognition } from "./recognition";
import { createMockSignVideo, createRealSignVideo } from "./signVideo";
import { createMockStt, createRealStt } from "./stt";
import { createMockTranslate, createRealTranslate } from "./translate";
import { createMockTts, createRealTts } from "./tts";
import type { Services } from "./types";

// One place that decides mock vs real for every service.
// "Play the full visit" always uses the mocks so the scripted demo is bulletproof.

const mocks: Services = {
  recognition: createMockRecognition(),
  translate: createMockTranslate(),
  tts: createMockTts(),
  stt: createMockStt(),
  avatar: createMockAvatar(),
  signVideo: createMockSignVideo(),
};

const pick = <K extends ServiceName>(name: K, real: () => Services[K]): Services[K] =>
  isMock(name) ? mocks[name] : real();

const live: Services = {
  recognition: pick("recognition", () => createRealRecognition()),
  translate: pick("translate", createRealTranslate),
  tts: pick("tts", createRealTts),
  stt: pick("stt", createRealStt),
  avatar: pick("avatar", createRealAvatar),
  signVideo: pick("signVideo", createRealSignVideo),
};

export const services = (demo: boolean): Services => (demo ? mocks : live);
export const liveServices = live;
export const mockServices = mocks;
export type { Services } from "./types";
