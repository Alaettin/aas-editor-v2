import { describe, expect, it } from "vitest";
import * as types from "@aas-core-works/aas-core3.1-typescript/types";
import * as jsonization from "@aas-core-works/aas-core3.1-typescript/jsonization";
import * as xmlization from "@aas-core-works/aas-core3.1-typescript/xmlization";
import * as verification from "@aas-core-works/aas-core3.1-typescript/verification";

/**
 * Abnahme aus Phase 0: die SDK laesst sich unter Vitest ueber ihre Subpath-Exports laden.
 * Faellt dieser Test aus, stimmt die Aufloesung des ESM-Builds nicht, siehe vitest.config.ts.
 */
describe("SDK-Aufloesung unter Vitest", () => {
  it("laedt alle vier genutzten Subpath-Module", () => {
    expect(typeof types.Environment).toBe("function");
    expect(typeof jsonization.toJsonable).toBe("function");
    expect(typeof xmlization.toXmlString).toBe("function");
    expect(typeof verification.verify).toBe("function");
  });

  it("serialisiert und validiert ein minimales Environment", () => {
    const env = new types.Environment();
    const text = JSON.stringify(jsonization.toJsonable(env));
    expect(text).toBe("{}");
    expect([...verification.verify(env)]).toHaveLength(0);
  });
});
