# concurrentUploadFile

 * 文件分片上传 ✔
 * 支持并发，并发上传只在文件夹内部会有 ✔
 * 定期调用submit接口，200个文件调用一次 ✔
 * 同一个文件夹下文件根据MD5去重 ✔
 * 通过FileReader读取文件类型，不符合的不上传 ✔
