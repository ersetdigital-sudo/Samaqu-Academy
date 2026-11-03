export function anonymize(text: string, names: string[] = []): string {
  let value = String(text ?? '');
  value = value.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email disamarkan]');
  value = value.replace(
    /\b(no\.?\s?rek(ening)?|rek(ening)?|bca|bni|bri|mandiri|bsi|cimb|permata)\b([^\d\n]{0,12})\d[\d\s.-]{6,20}\d/gi,
    '$1$4[rekening disamarkan]',
  );
  value = value.replace(/(\+?62|0)8[\d\s.-]{7,14}\d/g, '08xx-xxxx-xxxx');
  value = value.replace(/#?\b(SMQ|INV|TRX|ORD|ORDER)[-\s]?\d[\w-]*/gi, '[ID transaksi]');
  value = value.replace(/\b\d{16}\b/g, '[NIK disamarkan]').replace(/\b\d{10,}\b/g, '[angka disamarkan]');
  value = value.replace(
    /\b(jl\.?|jln\.?|jalan|gg\.?|gang|perum(ahan)?|komplek|blok)\s+[^\n,]{3,40}/gi,
    '[alamat disamarkan]',
  );
  names
    .filter((name) => name && name.length >= 2)
    .forEach((name) => {
      value = value.replace(
        new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
        '[Customer]',
      );
    });
  return value;
}

export interface PiiScanResult {
  hp: number;
  email: number;
  rekening: number;
  transaksi: number;
  alamat: number;
  nama: number;
}

export function piiScan(text: string, names: string[] = []): PiiScanResult {
  const value = String(text ?? '');
  const count = (pattern: RegExp) => (value.match(pattern) || []).length;
  return {
    hp: count(/(\+?62|0)8[\d\s.-]{7,14}\d/g),
    email: count(/[\w.+-]+@[\w-]+\.[\w.]+/g),
    rekening: count(
      /\b(rek(ening)?|bca|bni|bri|mandiri|bsi)\b[^\d\n]{0,12}\d[\d\s.-]{6,20}\d/gi,
    ),
    transaksi: count(/#?\b(SMQ|INV|TRX|ORD|ORDER)[-\s]?\d[\w-]*/gi),
    alamat: count(
      /\b(jl\.?|jln\.?|jalan|gg\.?|gang|perum(ahan)?|komplek|blok)\s+[^\n,]{3,40}/gi,
    ),
    nama: names.filter(
      (name) =>
        name && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(value),
    ).length,
  };
}

export function piiTotal(result: PiiScanResult): number {
  return Object.values(result).reduce((sum, value) => sum + value, 0);
}
