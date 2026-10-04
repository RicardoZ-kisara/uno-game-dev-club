export interface RoomDatabase {
 prepare(query:string):{bind(...params:(string|number)[]):{
  first<T>():Promise<T|null>;
  run():Promise<{meta:{changes:number}}>;
 }};
}
