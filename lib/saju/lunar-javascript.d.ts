declare module "lunar-javascript" {
  class EightChar {
    setSect(value: number): void;
    getYear(): string;
    getMonth(): string;
    getDay(): string;
    getTime(): string;
    getYun(gender: number, sect?: number): Yun;
  }

  class Lunar {
    getEightChar(): EightChar;
    getYearInGanZhiExact(): string;
  }

  class Solar {
    static fromYmdHms(
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
    ): Solar;
    getLunar(): Lunar;
    getYear(): number;
    nextHour(hours: number): Solar;
    toYmdHms(): string;
  }

  class LiuNian {
    getYear(): number;
    getAge(): number;
    getGanZhi(): string;
  }

  class DaYun {
    getIndex(): number;
    getStartYear(): number;
    getEndYear(): number;
    getStartAge(): number;
    getEndAge(): number;
    getGanZhi(): string;
    getLiuNian(count?: number): LiuNian[];
  }

  class Yun {
    getStartYear(): number;
    getStartMonth(): number;
    getStartDay(): number;
    getStartHour(): number;
    getStartSolar(): Solar;
    isForward(): boolean;
    getDaYun(count?: number): DaYun[];
  }

  const lunar: { Solar: typeof Solar };
  export default lunar;
}
