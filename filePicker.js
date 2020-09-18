import req from '../../../../api/AxiosApi.js'
import SparkMD5 from 'spark-md5'

/**
 * 文件分片上传 ✔
 * 支持并发，并发上传只在文件夹内部会有 ✔
 * 定期调用submit接口，200个文件调用一次 ✔
 * 同一个文件夹下文件根据MD5去重 ✔
 * 通过FileReader读取文件类型，不符合的不上传 ✔
 */
export default {
  data() {
    return {
      bePausing: false,
      dropTip: false,
      beUploading: false,
      packageObj: {},
      uploadedFilesCount: 0,
      filesCount: 0,
      bundleId: null,
      filesArr: [],
      loadProgress: 0,//单个文件夹或者文件上传进度
      total: 0,//单个文件夹或者文件的大小
      loaded: 0,//单个文件或者文件夹已上传的大小
      currentFileLoaded: 0,
      segmentSize: 10485760,//分片大小10M
      concurrentNo: 0,//当前并发数量
      concurrentMD5Pool: [],//MD5并发池
      concurrentMaxNo: 10,//最大并发数量
      filesArrUploadIdx: 0,//文件夹里面文件上传位置
      invalidFileQueue: [],//无效文件弹框
    }
  },
  destroyed() {
    document.removeEventListener("dragenter", this.dragEnterHandler);
    document.removeEventListener("dragover", this.dragOverHandler);
  },
  mounted() {
    document.addEventListener("dragenter", this.dragEnterHandler, false);
    document.addEventListener("dragover", this.dragOverHandler, false);
    this.$refs.mask.addEventListener("dragleave", this.dragLeaveHandler, false);
    this.$refs.mask.addEventListener("drop", this.dropHandler, false);
  },
  methods: {
    removeItem(name, isNatural = false) {
      if (this.packageObj[name] instanceof Array) {
        this.filesCount = this.filesCount - this.packageObj[name].length;
        this.$refs.directory.value = '';
      } else {
        this.filesCount--;
        this.$refs.file.value = '';
      }

      delete this.packageObj[name];
      if (Object.keys(this.packageObj).length === 0 && !isNatural) {
        this.concurrentNo = 0;
        this.uploadedFilesCount = 0;
        this.filesArrUploadIdx = 0;
      }

    },
    dragOverHandler(e) {
      e.preventDefault();
    },
    dragLeaveHandler(e) {
      e.preventDefault();
      this.dropTip = false;
    },
    addFile(b) {
      b === 1 ? this.$refs.directory.click() : this.$refs.file.click()
    },
    isValidFile(str) {
      return /\.dcm$/.test(str) || /\.bmp$/.test(str) || /\.png$/.test(str) || /\.jpg$/.test(str)
    },
    fileChangeHandler(e) {
      let fileList = e.target.files;
      let packageName = "";
      let filesArr = [];
      for (let i = 0; i < fileList.length; i++) {
        let f = fileList[i];
        if (f.webkitRelativePath) {
          // topogram/IM-0001-0001.dcm
          if (this.isValidFile(f.webkitRelativePath)) {
            this.filesCount++;
            packageName = f.webkitRelativePath.split("/")[0];
            filesArr.push(f);
          }
        } else {
          if (this.isValidFile(f.name)) {
            this.filesCount++;
            this.packageObj[f.name] = f;
          } else {
            this.$message({
              message: "请选择指定格式文件"
            });
            return false
          }
        }
      }

      if (filesArr.length > 0 && packageName) {
        this.packageObj[packageName] = filesArr
      } else {
        !this.packageObj[fileList[0].name] && this.$message({message: "该文件夹未包含指定格式文件",})
      }
    },
    pauseUpload() {
      this.beUploading = false;
      this.bePausing = true;
    },
    doUpLoad() {
      if (this.filesCount > 0) {
        this.beUploading = true;
        this.bePausing = false;
        if (!this.bundleId) this.bundleId = this.uuid();
        if (this.concurrentNo === 0) {
          this.filesArrUploadIdx = 0;
          this.oneByOneUpload()
        }
      }
    },
    submitData() {
      return req({
        method: "get",
        custom: {isAlert: false, dealLogin: false},
        url: `/dicom/dcm/submitData?uploadId=${this.bundleId}&patientTableId=${this.patientTableId}`
      })
    },
    loopSubmit(times, isArr, file, keyName) {
      console.log("loopSubmit", times, keyName, this.uploadedFilesCount)
      console.log(this.packageObj[keyName])
      if (times < 3) {
        this.submitData().then(r => {
          if (r.data.isSuccess) {
            console.log(this.packageObj[keyName].length)
            console.log(this.uploadedFilesCount)
            console.log(this.packageObj[keyName])
            this.uploadNextFile(isArr, file, keyName)
          } else {
            // redo
            this.loopSubmit(times + 1, isArr, file, keyName)
          }
        }).catch(() => {
          // redo
          this.loopSubmit(times + 1, isArr, file, keyName)
        })
      } else {
        this.pauseUpload();
        this.reduceConcurrentNo();
        this.$alert('网络异常，请稍后再试', {
          confirmButtonText: '确定',
          showClose: false
        });
      }
    },
    loopConfirmInvalidFiles(callback) {
      if (this.invalidFileQueue.length > 0) {
        const loopAlert = () => {
          const fileName = this.invalidFileQueue[this.invalidFileQueue.length - 1];
          this.$alert(`${fileName}文件内容格式错误，该文件不可用`, {
            confirmButtonText: '继续',
            closeOnClickModal: false,
            showClose: false,
            callback: () => {
              this.invalidFileQueue.pop();
              if (this.invalidFileQueue.length > 0) {
                loopAlert()
              } else {
                callback()
              }
            }
          });
        };
        loopAlert()
      } else {
        callback()
      }
    },
    oneByOneUpload() { // 逐个上传packageObj下的子项
      console.log('oneByOneUpload')

      this.total = 0;
      this.loaded = 0;
      let keys = Object.keys(this.packageObj);

      if (this.packageObj[keys[0]] instanceof Array && this.packageObj[keys[0]].length === 0) {
        this.removeItem(keys[0], true);
        keys = Object.keys(this.packageObj);
      }

      if (keys.length > 0) {
        let keyName = keys[0];
        let item = this.packageObj[keyName];
        // console.log(item)
        if (item instanceof Array && item.length > 0) {
          this.filesArr = [...item];
          for (let i = 0; i < item.length; i++) {
            this.total += item[i].size
          }
          this.concurrentMD5Pool = [];
          this.oneByOneUploadArr(this.filesArr, keyName)
        } else if (item instanceof File) {
          this.beginUpload(item, false, keyName)
        }

      } else {
        if (this.uploadedFilesCount > 0) {
          // upload end
          this.beforeEnd();
          this.submitData().then(r => {
            if (r.data.isSuccess) {
              req({
                method: 'POST',
                url: `/dicom/dcm/querySubmitData`,
                data: {uploadId: this.bundleId, patientTableId: this.patientTableId},
                formData: true,
                custom: {isAlert: false, dealLogin: false},
                meta: {'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'}
              }).then(r => {
                this.uploadComplete(r.data);
              }).catch(() => {
                this.uploadComplete({success: false});
              })
            } else {
              this.uploadComplete({success: false});
            }
          }).catch(() => {
            this.uploadComplete({success: false});
          })
        } else {
          this.beUploading = false;
        }
      }

    },
    oneByOneUploadArr(arr, keyName) { // 分组并发上传当前文件夹下的文件
      if (this.concurrentNo !== 0) return false;

      this.loopConfirmInvalidFiles(() => {
        let arrIndex = this.filesArrUploadIdx;
        if (arrIndex < arr.length) {
          let delta = this.concurrentMaxNo;
          if (arr.length - arrIndex < this.concurrentMaxNo) {
            delta = arr.length - arrIndex
          }

          for (let i = 0; i < delta; i++) {
            this.concurrentNo++;
            this.beginUpload(arr[this.filesArrUploadIdx], true, keyName);
            this.filesArrUploadIdx++;
          }
        } else {
          this.loadProgress = 0;
          this.filesArrUploadIdx = 0;
          this.removeItem(keyName, true);
          this.oneByOneUpload()
        }
      })

    },
    sliceFile(f, startPos, endPos) {
      startPos = startPos || 0;
      endPos = endPos || 0;
      return f.slice ? f.slice(startPos, endPos) : f.webkitSlice ? f.webkitSlice(startPos, endPos) : f.mozSlice ? f.mozSlice(startPos, endPos) : f;
    },
    uploadStream(startPosition, file, token, isArr, keyName) {
      let stackSize = startPosition + this.segmentSize;
      let endPosition = file.size;
      if (stackSize < file.size) endPosition = stackSize;
      if (startPosition >= file.size) return false;
      req({
        method: "post",
        url: `/file/upload?token=${token}&name=${file.name}&size=${file.size}&uploadId=${this.bundleId}`,
        data: this.sliceFile(file, startPosition, endPosition),
        timeout: 600000,
        meta: {
          "Content-Type": "application/octet-stream",
          "Content-Range": `bytes ${startPosition}-${endPosition}/${file.size}`
        },
        custom: {isAlert: false, dealLogin: false},
        onUploadProgress: (e) => {
          this.currentFileLoaded = e.loaded + startPosition;
          let rate;
          if (isArr) {
            rate = ((this.currentFileLoaded + this.loaded) / this.total).toFixed(2);
          } else {
            rate = (this.currentFileLoaded / this.total).toFixed(2);
          }
          let progress = parseInt(rate * 100);
          if (this.loadProgress < progress && progress < 100) this.loadProgress = progress;
        }
      }).then(_r => this.streamUploadSuccess(_r, endPosition, file, token, isArr, keyName)).catch((e) => {
        console.log(e);
        this.networkError()
      })
    },
    streamUploadSuccess(_r, endPosition, file, token, isArr, keyName) {
      if (_r.data.success) {
        if (endPosition === file.size) {
          this.uploadedFilesCount++;
          if (this.uploadedFilesCount % 200 === 0
            && this.uploadedFilesCount !== this.filesCount
            && this.filesArrUploadIdx !== this.filesArr.length
          ) {
            this.loopSubmit(0, isArr, file, keyName)
          } else {
            this.uploadNextFile(isArr, file, keyName)
          }
        } else {
          if (!this.bePausing) {
            this.uploadStream(endPosition, file, token, isArr, keyName)
          } else {
            isArr && this.reduceConcurrentNo();
          }
        }
      } else {
        if (_r.data.status === 1) {
          this.invalidFile(file.name, isArr, file, keyName)
        } else {
          this.networkError('网络异常，请稍后再试')
        }
      }
    },
    invalidFile(fileName, isArr, file, keyName) {
      if (isArr) {
        this.invalidFileQueue.push(fileName);
        this.uploadNextFile(isArr, file, keyName)
      } else {
        this.loopConfirmInvalidFiles(() => {
          this.uploadNextFile(isArr, file, keyName)
        })
      }
    },
    reduceConcurrentNo() {
      this.concurrentNo > 0 && this.concurrentNo--;
    },
    uploadNextFile(isArr, file, keyName) {
      if (isArr) {
        this.reduceConcurrentNo();
        this.loaded += file.size;
        if (this.packageObj[keyName]) {
          let lastFileIndex = this.packageObj[keyName].indexOf(file);
          this.packageObj[keyName].splice(lastFileIndex, 1);
        }
        !this.bePausing && this.oneByOneUploadArr(this.filesArr, keyName)
      } else {
        this.loadProgress = 0;
        this.removeItem(keyName, true);
        !this.bePausing && this.oneByOneUpload()
      }
    },
    calculateFileMD5(file, callback) {
      let chunkSize = 8388608,
        chunks = Math.ceil(file.size / chunkSize),
        currentChunk = 0,
        spark = new SparkMD5.ArrayBuffer(),
        fileReader = new FileReader();

      const loadNext = () => {
        let start = currentChunk * chunkSize,
          end = ((start + chunkSize) >= file.size) ? file.size : start + chunkSize;

        fileReader.readAsArrayBuffer(this.sliceFile(file, start, end));
      };

      fileReader.onload = e => {

        if (currentChunk === 0) {
          let byteArray = new Uint8Array(fileReader.result);
          let res = '', byte, step = 4, position = 128;
          for (let i = 0; i < step; i++) {
            byte = byteArray[position + i];
            if (byte === 0) position += step; // 跳过文件头部128个字节
            res += String.fromCharCode(byte)
          }
          console.log('isDicom: ', res /*=== 'DICM'*/) // 最终输出结果 // isDicom: true
          if (res !== 'DICM') {
            callback('error');
            return false
          }
        }


        spark.append(e.target.result);
        currentChunk++;

        if (currentChunk < chunks) {
          loadNext();
        } else {
          let md5 = spark.end();
          setTimeout(() => {
            callback(md5)
          }, 0)
        }
      };

      fileReader.onerror = () => {
        this.$message({
          message: "文件读取失败，请重新录入",
          type: 'error'
        })
      };

      loadNext();
    },
    beginUpload(file, isArr, keyName) {
      if (file.size === 0) {
        console.log("invalid")
        this.invalidFile(file.name, isArr, file, keyName);
        return false
      }
      if (!isArr) {
        this.total = file.size;
      }
      let commonData = {
        name: file.name,
        size: file.size,
        uploadId: this.bundleId,
      };
      let func = md5 => {
        if (md5 === 'error') {
          this.invalidFile(file.name, isArr, file, keyName);
          return false
        }

        const hadUploaded = () => {
          this.uploadedFilesCount++;
          console.log(this.uploadedFilesCount)
          if (isArr) {
            let rate = (this.loaded / this.total).toFixed(2);
            let progress = parseInt(rate * 100);
            if (this.loadProgress < progress && progress < 100) this.loadProgress = progress;
          } else {
            this.loadProgress = 100
          }
          if (this.uploadedFilesCount % 200 === 0
            && this.uploadedFilesCount !== this.filesCount
            && this.filesArrUploadIdx !== this.filesArr.length
          ) {
            this.loopSubmit(0, isArr, file, keyName)
          } else {
            this.uploadNextFile(isArr, file, keyName)
          }
        };
        const goOn = () => {
          req({
            method: "get",
            url: "/file/tk",
            custom: {isAlert: false, dealLogin: false},
            data: {...commonData, type: file.type, modified: file.lastModifiedDate, md5: md5}
          }).then(res => {
            if (res.data.isExist) {
              hadUploaded()
            } else if (res.data.token) {
              req({
                method: "get",
                url: "/file/upload",
                custom: {isAlert: false, dealLogin: false},
                data: {...commonData, token: res.data.token, client: "html5"}
              }).then(_res => {
                if (_res.data.start >= 0) {
                  this.uploadStream(_res.data.start, file, res.data.token, isArr, keyName)
                } else {
                  this.networkError('网络异常，请稍后再试')
                }
              }).catch((e) => {
                console.log(e);
                this.networkError()
              })
            } else {
              this.networkError('网络异常，请稍后再试')
            }
          }).catch((e) => {
            console.log(e);
            this.networkError()
          })
        };

        if (isArr) {
          if (this.concurrentMD5Pool.indexOf(md5) < 0) {
            this.concurrentMD5Pool.push(md5);
            goOn()
          } else {
            hadUploaded()
          }
        } else {
          goOn()
        }
      };
      this.calculateFileMD5(file, func)
    },
    networkError(message = '网络异常，影像导入失败，请检查网络', callback = () => {
    }) {
      this.reduceConcurrentNo();
      if (!this.bePausing) {
        this.pauseUpload();
        this.$alert(message, {
          confirmButtonText: '确定',
          showClose: false,
          callback: callback
        });
      } else {
        callback(false)
      }
    },
    dragEnterHandler(e) {
      e.preventDefault();
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        if (e.dataTransfer.items[i].kind !== "file") return false;
      }
      this.dropTip = true;
    },
    dealItemEntry(itemEntry) {
      let entryName = itemEntry.name;
      let filesArr = [];
      let loopDealEntry = (entry, loopHandler) => {
        if (entry.isFile && this.isValidFile(entry.name)) {
          this.filesCount++;
          entry.file(file => {
            filesArr.push(file);
            this.packageObj[entryName] = filesArr;
            this.packageObj = {...this.packageObj}
          });
        } else if (entry.isDirectory) {
          loopHandler(entry)
        }
      };
      let loopHandler = (entry) => {
        if (entry.isFile && this.isValidFile(entry.name)) {
          this.filesCount++;
          entry.file(file => {
            filesArr.push(file);
            this.packageObj[entryName] = filesArr;
            this.packageObj = {...this.packageObj}
          });
        } else if (entry.isDirectory) {
          let dirReader = entry.createReader();
          dirReader.readEntries(
            entries => {
              for (let i = 0; i < entries.length; i++) {
                loopDealEntry(entries[i], loopHandler);
              }
            }, err => console.log(err)
          );
        }
      };
      if (itemEntry.isFile && this.isValidFile(itemEntry.name)) {
        this.filesCount++;
        itemEntry.file(file => {
          this.packageObj[entryName] = file;
          this.packageObj = {...this.packageObj}
        })
      } else if (itemEntry.isDirectory) {
        loopHandler(itemEntry);
      }
    },
    dropHandler(e) {
      e.preventDefault();
      e.stopPropagation();
      if (!this.dropTip) return false;
      this.dropTip = false;
      let _filesCount = this.filesCount;

      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        let itemEntry = e.dataTransfer.items[i].webkitGetAsEntry();
        if (itemEntry === null) return false;
        if (this.packageObj.hasOwnProperty(itemEntry.name)) continue;
        this.dealItemEntry(itemEntry);
        setTimeout(() => {
          _filesCount === this.filesCount && this.$message({message: "未找到指定格式的文件",})
        }, 100)
      }

    },
    uuid() {
      let s = [];
      let hexDigits = "0123456789abcdef";
      for (let i = 0; i < 36; i++) {
        s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
      }
      s[14] = "4"; // bits 12-15 of the time_hi_and_version field to 0010
      s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1); // bits 6-7 of the clock_seq_hi_and_reserved to 01
      s[8] = s[13] = s[18] = s[23] = "-";
      return s.join("");
    },
  }
}

