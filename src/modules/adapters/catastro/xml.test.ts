import { describe, expect, it } from "vitest";
import { parseOvcBody, xmlToObject } from "./xml";

describe("OVC XML converter", () => {
  it("converts nested elements, repeated siblings and entities", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<consulta_dnp xmlns="http://www.catastro.meh.es/"><control><cudnp>2</cudnp></control>
<bico><bi><idbi><rc><pc1>4219020</pc1><pc2>TG3441N</pc2></rc></idbi><ldt>CL PUREZA 23 &amp; 25</ldt></bi>
<bi><idbi><rc><pc1>4219021</pc1><pc2>TG3441N</pc2></rc></idbi><ldt/></bi></bico></consulta_dnp>`;
    const obj = xmlToObject(xml) as {
      consulta_dnp: { control: { cudnp: string }; bico: { bi: Array<Record<string, unknown>> } };
    };
    expect(obj.consulta_dnp.control.cudnp).toBe("2");
    expect(obj.consulta_dnp.bico.bi).toHaveLength(2);
    expect(obj.consulta_dnp.bico.bi[0]?.ldt).toBe("CL PUREZA 23 & 25");
    expect(obj.consulta_dnp.bico.bi[1]?.ldt).toBe("");
  });
  it("returns the root element value for XML and the parsed object for JSON", () => {
    expect(parseOvcBody('{"a":{"b":1}}')).toEqual({ a: { b: 1 } });
    expect(parseOvcBody("<x:root xmlns:x='u'><x:v>1</x:v></x:root>")).toEqual({ v: "1" });
  });
});
