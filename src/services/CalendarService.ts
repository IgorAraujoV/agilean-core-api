import { BuildingStorage } from '../storage/BuildingStorage';

const SLOTS_PER_DAY = 4;

export class CalendarService {
  constructor(private storage: BuildingStorage) {}

  /**
   * Retorna as datas reais para cada dia do chart,
   * usando building.date(col) que passa pelo ACal completo
   * (com feriados, shifts removidos, etc).
   *
   * O range é calculado automaticamente a partir da coluna
   * máxima dos pacotes do building (via PackageStore.maxEndColumn).
   *
   * Cada "dia" no chart = 4 colunas (shifts).
   * Day 0 → col 1, Day 1 → col 5, Day N → col (N * 4 + 1).
   */
  dayDates(buildingId: string): string[] | null {
    const building = this.storage.get(buildingId);
    if (!building) return null;

    const maxCol = building.packageStore.maxEndColumn();
    const totalDays = Math.ceil(maxCol / SLOTS_PER_DAY);

    const dates: string[] = [];
    for (let day = 0; day < totalDays; day++) {
      const col = day * SLOTS_PER_DAY + 1;
      const date = building.date(col);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
    }
    return dates;
  }
}
