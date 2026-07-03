/**
 * Spotlight 常量
 */

export const SPOTLIGHT_RECENT_KEY = "spotlight-recent-questions";
export const RECENT_QUESTIONS_MAX = 10;

/** progress 意图下「数据分析」步骤的占位文案（后续替换为 LLM 基于真实数据的报告） */
export const PROGRESS_ANALYSIS_PLACEHOLDER = `通过人工填报数据，系统读取并汇总了各施工班组提交的每日掘进记录，得出当前累计进尺为 [填写数值] 米，今日掘进 [填写数值]米。
同时，系统基于算法模型对多源数据进行智能分析：通过提取施工人员定位历史中距离洞口最远的进深位置，结合同期运渣车运输频次与载重反算的开挖方量，并依据该掌子面的设计断面面积进行折算，模型计算出当前隧洞进度约为 [填写数值] 米。
两种方法所得进度数据已进行交叉验证与对比，为进度管理提供双重参考。`;
