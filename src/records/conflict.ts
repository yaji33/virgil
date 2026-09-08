export class RecordConflict extends Error {
  constructor(message = "Plan changed. Review the latest revision.") {
    super(message);
    this.name = "RecordConflict";
  }
}
