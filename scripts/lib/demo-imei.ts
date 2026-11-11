/** Valid (Luhn) demo IMEI from a sequence number. Pure helper (unit-tested). */
export function demoImei(seq: number): string {
  const payload = `35${String(990000000000 + seq).slice(-12)}`;
  let sum = 0;
  for (let i = 0; i < payload.length; i++) {
    let d = Number(payload[payload.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return payload + String((10 - (sum % 10)) % 10);
}
