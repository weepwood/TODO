// A navigation-only system notification action. No task identity, title,
// workspace scope, or account credentials are added to the action payload.
export const REMINDER_ACTION_TYPE='todo-reminder-navigation-v1';
export const OPEN_REMINDERS='todo-open-reminders';
export const reminderActionTypes=()=>[{id:REMINDER_ACTION_TYPE,actions:[{id:OPEN_REMINDERS,title:'查看提醒',foreground:true}]}];
export const isReminderNavigation=event=>event?.actionId===OPEN_REMINDERS;
