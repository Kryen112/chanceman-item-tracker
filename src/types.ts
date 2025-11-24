export interface MonsterDrop {
  monsterId: number;
  monsterName: string;
  dropChance: number;
  dropTable: string;
  quantity: [number, number];
}
