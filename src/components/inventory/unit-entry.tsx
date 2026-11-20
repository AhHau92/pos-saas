"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass, selectClass } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { identifierKey, parseBatteryHealth, parseIdentifierInput, UNIT_GRADES } from "@/modules/inventory/client";

/** One scanned unit in the preview table. */
export type UnitDraft = {
  /** IMEI or serial number (unique within the list) */
  key: string;
  imei: string | null;
  serialNumber: string | null;
  /** "" = no grade */
  grade: string;
  /** "" = unknown */
  battery: string;
};

export type IncomingUnitPayload = {
  imei: string | null;
  serialNumber: string | null;
  grade: string | null;
  batteryHealth: number | null;
};

/** Table rows → API payload. Throws a readable Error for a bad battery value. */
export function toIncomingUnits(units: UnitDraft[]): IncomingUnitPayload[] {
  return units.map((u) => {
    let batteryHealth: number | null;
    try {
      batteryHealth = parseBatteryHealth(u.battery);
    } catch (error) {
      throw new Error(`${u.key}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { imei: u.imei, serialNumber: u.serialNumber, grade: u.grade || null, batteryHealth };
  });
}

const SEPARATOR = /[\r\n,;\t]/;

/**
 * Scan box + preview table for IMEI / serial numbers.
 * - A barcode scanner types the number and presses Enter → the unit is added at once.
 * - A pasted list (one per line, or separated by commas / spaces) is added in one go.
 * - Values that are not valid IMEIs / serials stay in the box with an explanation.
 */
export function UnitEntry({
  units,
  onChange,
  max,
  withCondition = false,
  autoFocus = false,
}: {
  units: UnitDraft[];
  onChange: (units: UnitDraft[]) => void;
  /** Most units allowed (e.g. quantity still to receive on a purchase order) */
  max?: number;
  /** Used / refurbished stock: ask for grade and battery health per unit */
  withCondition?: boolean;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<string[]>([]);

  /** final = false keeps the text after the last separator in the box (still being typed or scanned). */
  function commit(value: string, final: boolean) {
    let complete = value;
    let rest = "";
    if (!final) {
      let cut = -1;
      for (let i = value.length - 1; i >= 0; i--) {
        if (SEPARATOR.test(value[i])) {
          cut = i;
          break;
        }
      }
      if (cut < 0) {
        setText(value);
        return;
      }
      complete = value.slice(0, cut + 1);
      rest = value.slice(cut + 1);
    }

    if (!complete.trim()) {
      setText(rest);
      return;
    }
    const parsed = parseIdentifierInput(complete);
    const known = new Set(units.map((u) => u.key));
    const added: UnitDraft[] = [];
    const notes = [...parsed.errors];
    const overflow: string[] = [];
    for (const id of parsed.identifiers) {
      const key = identifierKey(id);
      if (known.has(key)) {
        notes.push(`${key} is already in the list`);
        continue;
      }
      if (max !== undefined && units.length + added.length >= max) {
        overflow.push(key);
        continue;
      }
      known.add(key);
      added.push({ key, imei: id.imei, serialNumber: id.serialNumber, grade: "", battery: "" });
    }
    if (overflow.length > 0) notes.push(`Only ${max} can be entered here — ${overflow.length} not added`);
    if (added.length > 0) onChange([...units, ...added]);
    setMessages(notes);
    setText([...parsed.invalidTokens, ...overflow, rest].filter((s) => s.length > 0).join("\n"));
  }

  function update(key: string, patch: Partial<UnitDraft>) {
    onChange(units.map((u) => (u.key === key ? { ...u, ...patch } : u)));
  }

  const overMax = max !== undefined && units.length > max;

  return (
    <div>
      <div className="flex items-start gap-2">
        <textarea
          className={`${inputClass} font-mono`}
          rows={2}
          value={text}
          autoFocus={autoFocus}
          spellCheck={false}
          placeholder={"Scan IMEI / serial here (one by one), or paste a list —\none per line, or separated by commas or spaces"}
          onChange={(e) => {
            const value = e.target.value;
            // more than one character at once = paste → take everything, including the last value
            commit(value, value.length - text.length > 1);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(text, true);
            }
          }}
          onBlur={() => {
            if (text.trim()) commit(text, true);
          }}
        />
        <Button variant="secondary" onClick={() => commit(text, true)}>
          Add
        </Button>
      </div>
      {messages.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-xs text-rose-600">
          {messages.slice(0, 6).map((m, index) => (
            <li key={index}>{m}</li>
          ))}
          {messages.length > 6 ? <li>… and {messages.length - 6} more</li> : null}
        </ul>
      ) : null}

      {units.length > 0 ? (
        <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-10 px-3 py-1.5 text-left font-medium">#</th>
                <th className="px-3 py-1.5 text-left font-medium">IMEI / Serial</th>
                {withCondition ? (
                  <>
                    <th className="px-3 py-1.5 text-left font-medium">Grade</th>
                    <th className="px-3 py-1.5 text-left font-medium">Battery %</th>
                  </>
                ) : null}
                <th className="w-10 px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {units.map((u, index) => {
                const batteryBad = u.battery !== "" && Number(u.battery) > 100;
                return (
                  <tr key={u.key}>
                    <td className="px-3 py-1.5 text-xs tabular-nums text-slate-400">{index + 1}</td>
                    <td className="px-3 py-1.5 font-mono text-xs text-slate-900">
                      {u.key}
                      {u.serialNumber ? <span className="ml-1.5 font-sans text-slate-400">S/N</span> : null}
                    </td>
                    {withCondition ? (
                      <>
                        <td className="px-3 py-1">
                          <select
                            className={`${selectClass} w-24 py-1`}
                            value={u.grade}
                            onChange={(e) => update(u.key, { grade: e.target.value })}
                            aria-label={`Grade of ${u.key}`}
                          >
                            <option value="">—</option>
                            {UNIT_GRADES.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-1">
                          <input
                            className={`${inputClass} w-20 py-1 text-right ${batteryBad ? "border-rose-400" : ""}`}
                            inputMode="numeric"
                            placeholder="—"
                            value={u.battery}
                            onChange={(e) => update(u.key, { battery: e.target.value.replace(/[^\d]/g, "").slice(0, 3) })}
                            aria-label={`Battery health of ${u.key}`}
                          />
                        </td>
                      </>
                    ) : null}
                    <td className="px-2 py-1 text-right">
                      <button
                        type="button"
                        onClick={() => onChange(units.filter((x) => x.key !== u.key))}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Remove ${u.key}`}
                      >
                        <Icon name="x" className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-xs">
            <span className={overMax ? "font-medium text-rose-600" : "text-slate-600"}>
              {units.length} unit{units.length === 1 ? "" : "s"}
              {max !== undefined ? ` of ${max}` : ""}
            </span>
            <button type="button" className="text-rose-600 hover:underline" onClick={() => onChange([])}>
              Clear all
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
