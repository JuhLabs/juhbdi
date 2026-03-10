import { describe, test, expect } from "bun:test";
import { analyzeFile, analyzeFiles } from "./ast-analyzer";

const SAMPLE_TS = `
import { z } from "zod";
import type { Foo } from "./types";

export interface Config {
  name: string;
  value: number;
}

export type ConfigMap = Record<string, Config>;

export function createConfig(name: string, value: number): Config {
  if (value < 0) {
    throw new Error("negative value");
  }
  return { name, value };
}

const helper = (x: number): boolean => {
  return x > 0 && x < 100;
};

export class ConfigManager {
  private configs: Config[] = [];

  add(config: Config): void {
    if (this.configs.some(c => c.name === config.name)) {
      throw new Error("duplicate");
    }
    this.configs.push(config);
  }

  get(name: string): Config | undefined {
    return this.configs.find(c => c.name === name);
  }
}

export enum Status {
  Active = "active",
  Inactive = "inactive",
}
`;

describe("ast-analyzer", () => {
  describe("analyzeFile", () => {
    test("extracts function declarations", () => {
      const result = analyzeFile("test.ts", SAMPLE_TS);
      const fn = result.symbols.find((s) => s.name === "createConfig");
      expect(fn).toBeDefined();
      expect(fn!.kind).toBe("function");
      expect(fn!.exported).toBe(true);
      expect(fn!.parameters).toEqual(["name", "value"]);
      expect(fn!.returnType).toBe("Config");
    });

    test("extracts arrow functions", () => {
      const result = analyzeFile("test.ts", SAMPLE_TS);
      const fn = result.symbols.find((s) => s.name === "helper");
      expect(fn).toBeDefined();
      expect(fn!.kind).toBe("function");
      expect(fn!.exported).toBe(false);
    });

    test("extracts interfaces", () => {
      const result = analyzeFile("test.ts", SAMPLE_TS);
      const iface = result.symbols.find((s) => s.name === "Config" && s.kind === "interface");
      expect(iface).toBeDefined();
      expect(iface!.exported).toBe(true);
    });

    test("extracts type aliases", () => {
      const result = analyzeFile("test.ts", SAMPLE_TS);
      const type = result.symbols.find((s) => s.name === "ConfigMap");
      expect(type).toBeDefined();
      expect(type!.kind).toBe("type");
    });

    test("extracts classes with methods", () => {
      const result = analyzeFile("test.ts", SAMPLE_TS);
      const cls = result.symbols.find((s) => s.name === "ConfigManager" && s.kind === "class");
      expect(cls).toBeDefined();
      expect(cls!.exported).toBe(true);

      const addMethod = result.symbols.find((s) => s.name === "ConfigManager.add");
      expect(addMethod).toBeDefined();
      expect(addMethod!.kind).toBe("method");
      expect(addMethod!.parameters).toEqual(["config"]);
    });

    test("extracts enums", () => {
      const result = analyzeFile("test.ts", SAMPLE_TS);
      const enm = result.symbols.find((s) => s.name === "Status");
      expect(enm).toBeDefined();
      expect(enm!.kind).toBe("enum");
    });

    test("extracts imports", () => {
      const result = analyzeFile("test.ts", SAMPLE_TS);
      expect(result.imports).toHaveLength(2);

      const zodImport = result.imports.find((i) => i.module === "zod");
      expect(zodImport).toBeDefined();
      expect(zodImport!.names).toContain("z");
      expect(zodImport!.isTypeOnly).toBe(false);

      const typeImport = result.imports.find((i) => i.module === "./types");
      expect(typeImport).toBeDefined();
      expect(typeImport!.isTypeOnly).toBe(true);
    });

    test("extracts exports", () => {
      const result = analyzeFile("test.ts", SAMPLE_TS);
      const exportNames = result.exports.map((e) => e.name);
      expect(exportNames).toContain("Config");
      expect(exportNames).toContain("ConfigMap");
      expect(exportNames).toContain("createConfig");
      expect(exportNames).toContain("ConfigManager");
      expect(exportNames).toContain("Status");
    });

    test("calculates complexity", () => {
      const result = analyzeFile("test.ts", SAMPLE_TS);
      expect(result.complexity).toBeGreaterThan(0);

      const createConfig = result.symbols.find((s) => s.name === "createConfig");
      expect(createConfig!.complexity).toBeGreaterThanOrEqual(2); // base + if

      const helper = result.symbols.find((s) => s.name === "helper");
      expect(helper!.complexity).toBeGreaterThanOrEqual(2); // base + &&
    });

    test("counts total lines", () => {
      const result = analyzeFile("test.ts", SAMPLE_TS);
      expect(result.totalLines).toBeGreaterThan(30);
    });

    test("handles empty file", () => {
      const result = analyzeFile("empty.ts", "");
      expect(result.symbols).toHaveLength(0);
      expect(result.imports).toHaveLength(0);
      expect(result.exports).toHaveLength(0);
      expect(result.complexity).toBe(0);
    });

    test("handles re-exports", () => {
      const code = `export { foo, bar } from "./module";\nexport * from "./other";`;
      const result = analyzeFile("reexport.ts", code);
      expect(result.exports.some((e) => e.isReExport && e.name === "foo")).toBe(true);
      expect(result.exports.some((e) => e.isReExport && e.name === "*")).toBe(true);
    });

    test("handles namespace imports", () => {
      const code = `import * as path from "path";`;
      const result = analyzeFile("ns.ts", code);
      expect(result.imports[0].isNamespace).toBe(true);
      expect(result.imports[0].names).toContain("path");
    });
  });

  describe("analyzeFiles", () => {
    test("analyzes multiple files", () => {
      const results = analyzeFiles([
        { path: "a.ts", content: "export function foo() { return 1; }" },
        { path: "b.ts", content: "export const bar = 42;" },
      ]);
      expect(results).toHaveLength(2);
      expect(results[0].symbols.length).toBeGreaterThan(0);
      expect(results[1].symbols.length).toBeGreaterThan(0);
    });
  });
});
