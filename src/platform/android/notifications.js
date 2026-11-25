// Ask only after a user action. Foreground reminder delivery never opens a permission dialog.
export async function requireMobileNotificationPermission(invoke,{request=false}={}){
 if(await invoke('plugin:notification|is_permission_granted'))return;
 if(request&&await invoke('plugin:notification|request_permission')==='granted')return;
 throw Error('系统通知权限未授予');
}
