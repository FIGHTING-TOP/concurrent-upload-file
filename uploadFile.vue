<template>
  <div class="uploadFile">

    <div tabindex="-1" role="dialog" aria-modal="true" aria-label="HTML 片段" class="el-message-box__wrapper modalWrapper"
         style="z-index: 201;">
      <div class="el-message-box myBox">
        <div class="el-message-box__header modalHeader">
          <div class="el-message-box__title">
            <span class="headerText fz16" v-if="$route.params.patientTableId">已选择用户：{{patientInfo().patientName}}  {{patientInfo().patientId}}</span>
            <span class="headerText fz16" v-else>Step1: 选择患者核磁影像   >  Step2:    确定导入 >  Step3: 系统自动将核磁影像添加至患者 >   Step4: 完成导入</span>
          </div>
          <button type="button" aria-label="Close" class="el-message-box__headerbtn" @click="closeBox">
            <i class="el-message-box__close el-icon-close"></i>
          </button>
        </div>
        <div class="bigBox">
          <div class="handleTip">
            <span class="fz12 c999">
              点击下列按键选择导入影像，或直接拖拽文件夹或影像至此区域（支持.dcm、.png、.jpg、.bmp文件）
            </span>
          </div>
          <div class="el-message-box__content modalContainer">
            <figure v-for="(obj,name,idx) in packageObj" :key="name" :class="{file:!Array.isArray(obj),package:Array.isArray(obj)}">
              <div class="imgWrapper">
                <img src="../../../../assets/uploadFile/DCM.png" v-if="!Array.isArray(obj)">
                <img src="../../../../assets/uploadFile/package.png" v-else>
              </div>
              <p class="fileName fz18">{{name}}</p>
              <el-button type="danger" icon="el-icon-delete" v-if="loadProgress<=0?!beUploading:idx>0"
                         @click="removeItem(name)"
                         circle></el-button>
              <div class="mask" v-show="beUploading">
                <div class="uploading" v-if="idx===0">
                  <el-progress :percentage="loadProgress"
                               :show-text="false"
                               :color="variables.themeBlue"></el-progress>
                  <p class="bold" style="color: #ddd;margin-top: 10px;">{{loadProgress}}%</p>
                </div>
                <div class="waiting" v-else>
                  <span style="color: #ddd;">等待导入</span>
                </div>
              </div>
            </figure>
            <figure class="addFile" v-show="!beUploading && !isIE">
              <div @click="addFile(1)">
                <i class="iconfont fly iconicon_tianjia"></i>
                <i class="iconfont iconicon_wenjian"></i>
                <p class="themeBlue fz18">完整序列</p>
              </div>
            </figure>
            <figure class="addFile" v-show="!beUploading">
              <div @click="addFile">
                <i class="iconfont fly iconicon_tianjia"></i>
                <i class="iconfont iconicon_xulietupian"></i>
                <p class="themeBlue fz18">序列图片</p>
              </div>
            </figure>
          </div>
          <div class="mask" v-show="beUploading"></div>
        </div>

        <footer v-show="Object.keys(packageObj).length">
          <div>
            <el-button type="primary" round @click="doUpLoad" v-show="!beUploading">{{bePausing?"继续导入":"开始导入"}}
            </el-button>
            <el-button round @click="pauseUpload" v-show="beUploading">暂停导入</el-button>
          </div>
          <div style="padding-top: 15px">
            <span class="m-title fz14">共{{filesCount}}张图片，导入过程中请不要删除原始图片</span>
          </div>
        </footer>
        <div class="wjanimationBox" v-show="!isAnimaLoading">
          <p class="wjMask"></p>
          <div class="anBox" ref="wjanimationBox"></div>
          <span>文件已导入，正在智能分配...</span>
        </div>
      </div>
    </div>
    <div class="v-modal" tabindex="0" style="z-index: 200;"></div>

    <input type="file" webkitdirectory multiple @change="fileChangeHandler" ref="directory" style="display: none">
    <input type="file" accept=".dcm,.bmp,.png,.jpg" multiple @change="fileChangeHandler" ref="file" style="display: none">
    <div class="dropTip" v-show="dropTip" ref="mask">将文件拖到这里</div>

  </div>
</template>
<script>
  import filePicker from './filePicker.js'
  import variables from '@/styles/variables.scss'
  import Lottie from "lottie-web";
  import req from "@/api/AxiosApi";

  export default {
    mixins: [filePicker],
    data() {
      return {
        variables,
        isAnimaLoading: true,
        patientTableId: this.$route.params.patientTableId || 0,
        type: this.$route.params.type || 0
      };
    },
    computed: {
      isIE() {
        return !!window.ActiveXObject || "ActiveXObject" in window;
      },
    },
    destroyed() {
      this.$store.commit("setting/toggleSidebar")
    },
    mounted() {
      this.$store.commit("setting/closeSidebar", true);
      this.runAnimation();
    },
    methods: {
      beforeEnd() {
        this.isAnimaLoading = false
      },
      patientInfo(){
        return JSON.parse(window.sessionStorage.getItem('patientInfo'))
      },
      /**
       * 是否保存他人数据
       */
      dcmSaveOther(flag) {
        req({method: "POST", url: `/dicom/dcm/dcmSaveOther/${this.bundleId}/${flag}`}).then(r => {

        });
      },
      uploadComplete(res) {
        setTimeout(() => {
          this.isAnimaLoading = true;
          if (res.isSuccess) {
            
          } else {
            this.errorTip();
          }
        }, 3000)

      },
      errorTip() {
        this.$alert(`影像导入失败`, this.$t("common.tips"), {
          confirmButtonText: "查看所有患者影像",
          callback: () => {
            this.$router.replace({"name": "patientInquire"});
          }
        });
      },
      closeBox() {
        this.$confirm('取消后，将终止核磁影像的导入，确定要取消吗？', '', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => {
          this.$router.go(-1)
        }).catch(() => {
        });
      },
      runAnimation() {
        Lottie.loadAnimation({
          container: this.$refs.wjanimationBox,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          // animationData:require("./public/static/img/animation/uploadFile/data.json")
          path: "./static/img/animation/uploadFile/data.json"
        });
      },
    }
  };
</script>
<style lang="scss">
  @import '../../../../styles/variables.scss';

  .uploadFile {
    .modalWrapper {
      overflow: hidden;

      .myBox {
        width: 95%;
        height: 93%;
        background: #26282E;
        border-radius: 10px;
        border: none;
        padding-bottom: 0;
        position: relative;

        .modalHeader {
          padding: 20px 0 20px 30px;
          background: rgba(255, 255, 255, .15);

          .headerText {
            color: #ddd;
          }

          .el-message-box__headerbtn {
            top: 18px
          }

          .el-message-box__close {
            color: #ddd;
          }
        }


        .handleTip {
          box-sizing: border-box;
          height: 40px;
          padding-top: 20px;
          padding-left: 58px
        }

        .modalContainer {
          margin-top: 10px;
          height: calc(100% - 150px);
          overflow-x: hidden;
          overflow-y: auto;
          box-sizing: border-box;
          padding: 30px;
          display: flex;
          flex-wrap: wrap;
          position: relative;

          figure {
            width: 195px;
            height: 195px;
            text-align: center;
            margin: 0;
            box-sizing: border-box;
            position: relative;

            img {
              width: 100%
            }

            P {
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            &.file {
              .imgWrapper {
                padding: 35px 48px 0 48px;
              }

              p {
                margin-top: 20px;
              }
            }

            &.package {
              .imgWrapper {
                padding: 20px 30px 0 30px;
              }
            }

            .fileName {
              color: #ddd;
              padding-bottom: 3px;
            }

            &.addFile {
              padding: 30px;
              user-select: none;

              .iconfont {
                display: inline-block;
                margin: 22px 0 12px 0;
                font-size: 50px;
                color: $blue2;

                &.fly {
                  position: absolute;
                  right: 10px;
                  top: 10px;
                  font-size: 20px;
                  margin: 0;
                }
              }

              div {
                position: relative;
                width: 100%;
                height: 100%;
                cursor: pointer;
                border-radius: 10px;
                background: rgba(0, 160, 255, .1);
              }

            }

            .el-button {
              position: absolute;
              width: 32px;
              height: 32px;
              margin: 0;
              right: 5px;
              padding: 0;
              top: 0;
              font-size: 16px;
              background: rgba(255, 255, 255, .1);
              border: none;
              display: none;
            }

            &:hover {
              .el-button {
                display: block;
              }
            }

            .mask {
              background: transparent;
              z-index: 1;
              padding: 80px 45px 0 45px;

              .uploading {
                .el-progress-bar__outer {
                  background: rgba(221, 221, 221, .1);
                }
              }
            }
          }
        }

        .bigBox {
          height: calc(100% - 58px);
          position: relative;

          .mask {
            position: absolute;
            width: 100%;
            height: 100%;
            top: 0;
            left: 0;
            background: rgba(0, 0, 0, .5);
          }
        }

        footer {
          display: flex;
          justify-content: space-between;
          background: rgba(255, 255, 255, .05);
          position: absolute;
          width: 100%;
          left: 0;
          bottom: 0;
          padding: 20px 30px;

          .el-button {
            width: 260px;
            padding: 16px 0;
            font-size: 18px;
            font-weight: bold;
            border-radius: 25px;

            &.el-button--primary {
              background: $blue2;
            }

            &.el-button--default {
              background: transparent;
              color: $blue2;
              border-color: $blue2;
            }
          }
        }

        .wjanimationBox {
          position: absolute;
          top: 50%;
          width: 100%;
          text-align: center;
          margin-top: -100px;
          .wjMask{
            position: fixed;
            width: 100%;
            height: 100%;
            top: 0px;
            left: 0px;
          }
          .anBox {
            width: 200px;
            display: inline-block;
          }

          span {
            display: inline-block;
            min-height: 80px;
            line-height: 24px;
            text-align: left;
            color: #DDDDDD;
            vertical-align: middle;
            font-size: 24px;
            margin-left: 0px;
            margin-top: -150px;
          }
        }
      }
    }
    .dropTip {
      position: fixed;
      background: rgba(255, 255, 255, 0.6);
      border: 3px dashed rgb(204, 204, 204);
      z-index: 1000000;
      color: #c9c9c9;
      font-size: 40px;
      text-align: center;
      overflow: hidden;
      top: 0px;
      left: 0px;
      height: 100vh;
      line-height: 100vh;
      width: 100vw;
    }
  }

</style>
