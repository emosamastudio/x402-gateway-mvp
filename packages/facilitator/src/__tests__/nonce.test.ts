import { describe, it, expect, beforeEach } from "vitest";
import { NonceStore } from "../nonce.js";

describe("NonceStore", () => {
  let store: NonceStore;
  beforeEach(() => { store = new NonceStore(); });

  it("marks a new nonce as unused", () => {
    expect(store.isUsed("0xabc123")).toBe(false);
  });

  it("marks a nonce as used after registration", () => {
    store.markUsed("0xabc123");
    expect(store.isUsed("0xabc123")).toBe(true);
  });

  it("different nonces are independent", () => {
    store.markUsed("0xaaa");
    expect(store.isUsed("0xbbb")).toBe(false);
  });

  it("treats mixed-case nonces as the same", () => {
    store.markUsed("0xAABBCC");
    expect(store.isUsed("0xaabbcc")).toBe(true);
  });
});
