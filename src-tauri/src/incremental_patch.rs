use serde_json::{Value,json};
use std::collections::BTreeMap;
fn meta(v:&Value)->Result<Value,String>{let mut m=v.clone();m.as_object_mut().ok_or("meta")?.remove("tasks");Ok(m)}
pub(super) fn patch(before:&Value,after:&Value)->Value{
 let a:BTreeMap<_,_>=before["tasks"].as_array().unwrap().iter().map(|t|(t["id"].as_str().unwrap(),t)).collect();
 let b:BTreeMap<_,_>=after["tasks"].as_array().unwrap().iter().map(|t|(t["id"].as_str().unwrap(),t)).collect();
 let put:Vec<_>=b.iter().filter(|(id,t)|a.get(**id)!=Some(t)).map(|(id,t)|json!({"id":id,"before":a.get(id),"after":t})).collect();
 let remove:Vec<_>=a.iter().filter(|(id,_)|!b.contains_key(**id)).map(|(id,t)|json!({"id":id,"before":t})).collect();
 let order=|v:&Value|v["tasks"].as_array().unwrap().iter().map(|t|t["id"].clone()).collect::<Vec<_>>();
 let ao=order(before);let bo=order(after);let m=meta(before).unwrap();let n=meta(after).unwrap();
 json!({"put":put,"remove":remove,"order":if ao==bo{Value::Null}else{json!(bo)},"meta":if m==n{Value::Null}else{json!({"before":m,"after":n})}})
}
