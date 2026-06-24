// == 调试日志 ================================================================
//
// 职责：
// - 根据 consoleOutputLog_Switch 决定是否输出日志。
// - 提供对象浅对比，避免重复打印 videoInfoDict。

let getSettings = () => ({ consoleOutputLog_Switch: false });

export function bindLoggerSettings(settingsProvider) {
    getSettings = settingsProvider;
}

export function consoleLogOutput(...args) {
    if (!getSettings().consoleOutputLog_Switch) {
        return;
    }

    console.log(...args);
}

export function objectDifferent(obj1, obj2) {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
        return true;
    }

    for (const key of keys1) {
        if (obj1[key] !== obj2[key]) {
            return true;
        }
    }

    return false;
}
