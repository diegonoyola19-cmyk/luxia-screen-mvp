import { mapVertiluxApiInventoryItem } from '../src/logic/mapVertiluxApiInventoryItem';

const res = mapVertiluxApiInventoryItem({
  ITEMNO: "00048620098",
  DESCRIPTION: "VX Screen 3000-1 Ebony Pearl 98.43\"",
  UNIT: "SQYD",
  QTYONHAND: 243.68,
  QTYONORDER: 791.74
} as any);

console.log(JSON.stringify(res, null, 2));
