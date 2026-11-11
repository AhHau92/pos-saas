"use client";

import { useEffect, useState } from "react";
import { centsToInput, parseMoneyToCents } from "@/lib/money";
import { inputClass } from "./form";

/** Text input for money that stores integer cents and only reformats on blur. */
export function MoneyInput({
  value,
  onChange,
  className = "",
  disabled,
  ariaLabel,
}: {
  value: number;
  onChange: (cents: number) => void;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(centsToInput(value));

  useEffect(() => {
    // keep in sync when the value changes from outside
    if (parseMoneyToCents(text) !== value) setText(centsToInput(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      inputMode="decimal"
      className={`${inputClass} text-right tabular-nums ${className}`}
      value={text}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => {
        setText(e.target.value);
        const cents = parseMoneyToCents(e.target.value);
        if (cents !== null && cents >= 0) onChange(cents);
      }}
      onBlur={() => setText(centsToInput(value))}
      onFocus={(e) => e.target.select()}
    />
  );
}
