export class ScaffoldNotImplementedError extends Error {
  constructor(component: string) {
    super(`${component} is not wired yet. No chain execution or snapshot generation is available.`);
    this.name = 'ScaffoldNotImplementedError';
  }
}
