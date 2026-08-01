export type OptionalAbsenceReader<T> = () => T;
export declare function selectDefinedValue<T>(...readers: Array<OptionalAbsenceReader<T>>): T;
export declare function selectTruthyValue<T>(...readers: Array<OptionalAbsenceReader<T>>): T;
