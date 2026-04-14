/**
 * elogis 파일 슬롯 설정
 *
 * 각 파일마다:
 *   slotKey      : admin 파일업로드 슬롯 키 (SLOT_CONFIGS 의 key)
 *   label        : 로그에 표시될 이름
 *   type         : 'generic' (R2 저장) | 'store-master' (DB 반영)
 *   pageUrl      : elogis 에서 해당 데이터를 조회하는 페이지 URL
 *   prepareParams: commonExcelDownPrepare POST 파라미터
 *                  (Network 탭 > Payload 에서 복사)
 *
 * ※ USER_SESSION_ID 는 로그인 후 자동으로 추출되므로 여기에 쓰지 않습니다.
 * ※ pageUrl 을 TODO 로 남겨둔 파일은 해당 URL 을 찾아 채워주세요.
 */

const FILE_CONFIGS = [
  // ── 1. 점포마스터 (etms TMS 시스템, 클릭 자동화) ─────────────────────────
  {
    slotKey: "store-master",
    label: "점포마스터",
    type: "store-master",
    tmsDownload: true,          // TMS 새창에서 클릭으로 다운로드
    pageUrl: "https://elogis.emart24.co.kr/", // TMS 진입점 (elogis 메인)
    tmsConfig: {
      배송그룹: "D9012343",     // 배송그룹 입력값
    },
    prepareParams: null,        // TMS 는 API 방식 아님
  },

  // ── 2. 상품마스터 ─────────────────────────────────────────────────────────
  {
    slotKey: "product-master",
    label: "상품마스터",
    type: "generic",
    pageUrl: "https://elogis.emart24.co.kr/",
    menuPath: ["마스터관리 (MDM)", "상품관리", "상품"],
    prepareParams: {
      PAGING: "N",
      CURRENT_MENUCODE: "MDM202000",
      CURRENT_MENUNAME: "MENU_ITEM_MANAGER::MENU_ITEM",
      DOWN_EXCEL_FILTERED_ROWS: "N",
      SEARCH_URL: "/mitemMasterService/search",
      EXCEL_SHEET_TITLE: "MENU_ITEM_MANAGER::MENU_ITEM",
      EXCEL_HEADERCOLS: "STRR_ID,STRR_NM,ITEM_CD,ITEM_NM,ABBR_NM,ITEMGRP_BNM,ITEMGRP_MNM,ITEMGRP_SNM,ISSUE_GCD,MIS_ORDER_QTY,OUTBOX_ACQ_QTY,CENT_PICK_ACQ,SBDT_SYNC_YN,TEMP_TCD,MEDI_ITEM_YN,WEIGHT_ITEM_YN,ITEM_STRG_CD,WT_TCD,RFID_ADMIN_YN,BOT_EXIST,BOT_GDS_CD,BOT_GDS_NM,WIDTH,LENGTH,HEIGHT,VOL,INNER_BOX_HORZ_LEN_VAL,INNER_BOX_VERT_LEN_VAL,INNER_BOX_HIGH_VAL,OTSD_BOX_HORZ_LEN_VAL,OTSD_BOX_VERT_LEN_VAL,OTSD_BOX_HIGH_VAL,VOL_MEASURE,ADJST_VOL_RIO,ADJST_VOL,BOX_VOL,WT,WT_MEASURE,ADJST_WT_RIO,ADJST_WT,BOX_WT,SKU_WT,LOGI_BARCODE,ITEM_BARCODE,ITEM_MGMT_GRADE,ITEM_SCD,TAX_TCD,SHELFLIFE_YN,SHELFLIFE_TCD,PROD_VALID_DAYS,REPORT_PRT_YN,EXPORT_ITEM_YN,QM_YN,HIS_ITEM_YN,PURCOST,SUPPRC,SALPRC,PKG_TP_NM,PKG_ITEM_CD,PKG_ITEM_NM,PKG_ACQ_QTY,ST_DT,END_DT,USE_YN,RMK,INS_DATETIME,INS_PERSON_ID,UPD_DATETIME,UPD_PERSON_ID",
      EXCEL_HEADERCOLS_TEXT: "화주사코드,화주사명,상품코드,상품명,단축명,대분류명,중분류명,소분류명,이슈그룹코드,오발주기준배수*,외박스입수*,센터피킹입수*,소비기한동기화여부,온도유형,의약품여부,계근상품여부,상품저장코드,중량유형코드,RFID관리여부,공병여부,공병상품코드,공병상품명,가로(cm),세로(cm),높이(cm),부피,이너박스 가로(cm),이너박스 세로(cm),이너박스 높이(cm),외박스 가로(cm),외박스 세로(cm),외박스 높이(cm),부피규격,조정부피율(<percentage>),조정부피,박스부피,총중량,중량규격,조정중량율(<percentage>),조정중량,박스중량,낱개순중량,물류바코드,상품바코드,상품관리중요도,상품상태,과세구분,소비기한관리,소비기한관리방식,제조유통기한일,출하증명서인쇄여부,수출상품여부,품질관리여부,이력상품여부,매입원가,공급가,판매가,이마트리오더변환구분,이마트패키지상품코드,이마트패키지상품,이마트패키지입수수량,시작일자,종료일자,사용여부,비고,입력일시,입력자 ID,수정일시,수정자 ID",
      EXCEL_HEADER_DEPTH: "1",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_COLNAMES: "STRR_ID,STRR_NM,ITEM_CD,ITEM_NM,ABBR_NM,ITEMGRP_BNM,ITEMGRP_MNM,ITEM_GNM,ISSUE_GCD,MIS_ORDER_QTY,OUTBOX_ACQ_QTY,CENT_PICK_ACQ,SBDT_SYNC_YN,TEMP_TCD,MEDI_ITEM_YN,WEIGHT_ITEM_YN,ITEM_STRG_CD,WT_TCD,RFID_ADMIN_YN,BOT_EXIST,BOT_GDS_CD,BOT_GDS_NM,WIDTH,LENGTH,HEIGHT,VOL,INNER_BOX_HORZ_LEN_VAL,INNER_BOX_VERT_LEN_VAL,INNER_BOX_HIGH_VAL,OTSD_BOX_HORZ_LEN_VAL,OTSD_BOX_VERT_LEN_VAL,OTSD_BOX_HIGH_VAL,VOL_MEASURE,ADJST_VOL_RIO,ADJST_VOL,BOX_VOL,WT,WT_MEASURE,ADJST_WT_RIO,ADJST_WT,BOX_WT,SKU_WT,LOGI_BARCODE,ITEM_BARCODE,ITEM_MGMT_GRADE,ITEM_SCD,TAX_TCD,SHELFLIFE_YN,SHELFLIFE_TCD,PROD_VALID_DAYS,REPORT_PRT_YN,EXPORT_ITEM_YN,QM_YN,HIS_ITEM_YN,PUR_COST,SUP_PRC,SAL_PRC,PKG_TP_CD,PKG_ITEM_CD,PKG_ITEM_NM,PKG_ACQ_QTY,ST_DT,ED_DT,USE_YN,RMK,INS_DATETIME,INS_PERSON_ID,UPD_DATETIME,UPD_PERSON_ID",
      EXCEL_COL_WIDTH: "autofit,150,68,160,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,120,150,80,80,80,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,80,autofit,autofit,autofit,autofit,80,90,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,120,120,80,autofit,140,autofit,140,autofit",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "NaN",
      EXCEL_DATE_COLS: "ST_DT,ED_DT,INS_DATETIME,UPD_DATETIME",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_NUMBER_COLS: "OUTBOX_ACQ_QTY,CENT_PICK_ACQ,WIDTH,LENGTH,HEIGHT,VOL,INNER_BOX_HORZ_LEN_VAL,INNER_BOX_VERT_LEN_VAL,INNER_BOX_HIGH_VAL,OTSD_BOX_HORZ_LEN_VAL,OTSD_BOX_VERT_LEN_VAL,OTSD_BOX_HIGH_VAL,ADJST_VOL_RIO,ADJST_VOL,BOX_VOL,WT,ADJST_WT_RIO,ADJST_WT,BOX_WT,SKU_WT,PROD_VALID_DAYS",
      EXCEL_COL_ALIGN: "center,left,center,left,left,left,left,left,center,right,right,right,center,center,center,center,center,center,center,center,center,left,right,right,right,right,right,right,right,right,right,right,center,right,right,right,right,center,right,right,right,right,center,center,center,center,center,center,center,right,center,center,center,center,right,right,right,center,left,left,right,center,center,center,left,center,left,center,left",
      EXCEL_COL_HIDDEN: "",
      EXCEL_COL_COMBOCOLS: "ISSUE_GCD,SBDT_SYNC_YN,TEMP_TCD,MEDI_ITEM_YN,WEIGHT_ITEM_YN,ITEM_STRG_CD,WT_TCD,RFID_ADMIN_YN,BOT_EXIST,VOL_MEASURE,WT_MEASURE,ITEM_MGMT_GRADE,ITEM_SCD,TAX_TCD,SHELFLIFE_YN,SHELFLIFE_TCD,REPORT_PRT_YN,EXPORT_ITEM_YN,QM_YN,HIS_ITEM_YN,PKG_TP_CD,USE_YN",
      EXCEL_COL_CHECKCOLS: "",
      EXCEL_HEADERMERGE: "",
      SES_LANG: "KO",
      SES_USERGROUP: "2000000300",
      SES_WHSE: "T01234",
      SES_MULTI_LANG_YN: "N",
    },
  },

  // ── 3. 작업센터별 취급상품 마스터 (메뉴 클릭 + 검색 입력 후 3단계 API) ────
  {
    slotKey: "workcenter-product-master",
    label: "작업센터별 취급상품 마스터",
    type: "generic",
    pageUrl: "https://elogis.emart24.co.kr/",
    menuPath: ["마스터관리 (MDM)", "상품관리", "작업센터 취급상품 마스터"],
    searchInputs: [
      {
        label: "작업센터코드",
        value: "901234,901235,901237,901238,901239,901240,901363",
        // 자동 탐색 실패 시 아래 selector 주석 해제 후 수정:
        // selector: 'input[name="centCd"]',
      },
    ],
    prepareParams: {
      PAGING: "N",
      CURRENT_MENUCODE: "MD201040",
      CURRENT_MENUNAME: "MENU_ITEM_MANAGER::MENU_TASK_CENTER_PRODUCT",
      DOWN_EXCEL_FILTERED_ROWS: "N",
      SEARCH_URL: "/mtaskCenterProductService/search",
      EXCEL_SHEET_TITLE: "MENU_ITEM_MANAGER::MENU_TASK_CENTER_PRODUCT",
      EXCEL_HEADERCOLS: "CENT_NM,ITEM_CD,ITEM_NM,TAX_TCD,OUTBOX_BARCD,OUTBOX_ACQ_QTY,INBOX_BARCD,INBOX_ACQ_QTY,ITEMGRP_BNM,ITEMGRP_MNM,ITEMGRP_SCD,ITEMGRP_SNM,STR_GDS_ACQ,ORD_ACQ_UNIT_QTY,CENT_PICK_ACQ,OUT_BASE_DAYS,OUT_AMT_C,SERVICE_SUPPLY_CD,SERVICE_SUPPLY_NM,WIDTH,LENGTH,HEIGHT,BOX_WIDTH_VAL,BOX_LENGTH_VAL,BOX_HEIGHT_VAL,CPCT,CPCT_UNIT,PLT_ACQ_QTY,PROD_VALID_DAYS,EMPBOT_ADMIN_YN,IN_BASE_DAYS,CENT_ORD_ENBL_YN,HDL_STAT_CD,IE_HLD_YN,STR_ORD_ENBL_YN,GDS_MGMT_STAT_CD,CENT_STR_ORD_YN,USE_YN",
      EXCEL_HEADERCOLS_TEXT: "센터명,상품코드,상품명,과세구분,외박스바코드,외박스입수,이너박스바코드,이너박스입수,대분류명,중분류명,소분류코드,소분류명,매장발주입수,센터발주입수,센터피킹입수,출고기준일수,공급가C,거래처코드,거래처명,가로(cm),세로(cm),높이(cm),박스 가로값,박스 세로값,박스 높이값,무게,단위,팔레트당 입수수량,제조유통기한일,공병관리여부,입고기준일수,센터발주가능여부,취급여부,반입반출 취급여부,점포발주가능여부,운영상태,센터별 점포발주가능여부,사용여부",
      EXCEL_HEADER_DEPTH: "1",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_COLNAMES: "CENT_NM,ITEM_CD,ITEM_NM,ITX_TP_CD,OUTBOX_BARCD,OUTBOX_ACQ_QTY,INBOX_BARCD,INBOX_ACQ_QTY,ITEMGRP_BNM,ITEMGRP_MNM,ITEM_GCD,ITEMGRP_SNM,STR_GDS_ACQ,ORD_ACQ_UNIT_QTY,CENT_PICK_ACQ,OUT_BASE_DAYS,OUT_AMT_C,SUPPR_ID,SUPPR_NM,WIDTH,LENGTH,HEIGHT,BOX_WIDTH_VAL,BOX_LENGTH_VAL,BOX_HEIGHT_VAL,CPCT,CPCT_UNIT,PLT_ACQ_QTY,PROD_VALID_DAYS,EMPBOT_ADMIN_YN,IN_BASE_DAYS,CENT_ORD_ENBL_YN,HDL_STAT_CD,IN_OUT_HLD_YN,STR_ORD_ENBL_YN,GDS_MGMT_STAT_CD,CENT_STR_ORD_YN,USE_YN",
      EXCEL_COL_WIDTH: "99,120,100,autofit,92,autofit,104,autofit,68,68,80,68,autofit,autofit,autofit,autofit,autofit,autofit,68,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "5",
      EXCEL_DATE_COLS: "INS_DATETIME,UPD_DATETIME",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_NUMBER_COLS: "OUT_BASE_DAYS,OUT_AMT_C,WIDTH,LENGTH,HEIGHT,BOX_WIDTH_VAL,BOX_LENGTH_VAL,BOX_HEIGHT_VAL,PROD_VALID_DAYS,IN_BASE_DAYS",
      EXCEL_COL_ALIGN: "left,center,left,center,center,right,center,right,center,center,center,center,right,right,right,right,right,center,left,right,right,right,right,right,right,right,right,right,right,center,right,center,center,center,center,center,center,center",
      EXCEL_COL_HIDDEN: "",
      EXCEL_COL_COMBOCOLS: "ITX_TP_CD,EMPBOT_ADMIN_YN,CENT_ORD_ENBL_YN,HDL_STAT_CD,IN_OUT_HLD_YN,STR_ORD_ENBL_YN,GDS_MGMT_STAT_CD,CENT_STR_ORD_YN,USE_YN",
      EXCEL_COL_CHECKCOLS: "",
      EXCEL_HEADERMERGE: "",
      SES_LANG: "KO",
      SES_USERGROUP: "2000000300",
      SES_WHSE: "T01234",
      SES_MULTI_LANG_YN: "N",
    },
  },

  // ── 4. 셀관리 ─────────────────────────────────────────────────────────────
  {
    slotKey: "cell-management",
    label: "셀관리",
    type: "generic",
    pageUrl: "https://elogis.emart24.co.kr/",
    menuPath: ["창고관리 (WMS)", "기준정보", "로케이션", "셀 관리"],
    prepareParams: {
      PAGING: "N",
      WH_CD: "T01234",
      CURRENT_MENUCODE: "WMS101218",
      CURRENT_MENUNAME: "MENU_MAS_LOC::MENU_WCELL",
      DOWN_EXCEL_FILTERED_ROWS: "N",
      SEARCH_URL: "/cellService/search",
      EXCEL_SHEET_TITLE: "MENU_MAS_LOC::MENU_WCELL",
      EXCEL_HEADERCOLS: "WH_CD,WCELL_NO,WCELL_NM,ZONE_CD,ZONE_NM,WLOC_CD,WORK_SECT,STORAGE_TYPE,WCELL_TYP,WCELL_TCD,WCELL_SPEC,HOLDSTATUS,COMMINGLESTOCK,COMMINGLELOT,FULL_BOX_LOC_YN,CHG_WORK_SCTN_CD,ITEM_CNT2,ITEM_CD,ITEM_NM,LONGDESCR,STAGE_YN,USE_YN,INS_DATETIME,INS_PERSON_ID,UPD_DATETIME,UPD_PERSON_ID",
      EXCEL_HEADERCOLS_TEXT: "창고코드*,셀코드*,셀명*,존코드*,존명,로케이션코드*,작업구간,보관설비형태,셀상태*,단*,셀규격*,보류상태,상품혼적,로트혼적,완박스할당셀여부,변경작업구분코드,상품건수,상품코드,상품명,비고,스테이지여부*,사용여부*,입력일시,입력자 ID,수정일시,수정자 ID",
      EXCEL_HEADER_DEPTH: "1",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_COLNAMES: "WH_CD,WCELL_NO,WCELL_NM,ZONE_CD,ZONE_NM,WLOC_CD,WORK_SECT_TCD,STRG_RACK_TCD,WCELL_TYP,WCELL_TCD,WCELL_STRG_CD,HLD_SCD,MIXED_ITEM_YN,MIXED_LOT_YN,FULL_BOX_YN,WORK_SCTN_CD,ITEM_CNT2,ITEM_CD,ITEM_NM,RMK,STAGE_YN,USE_YN,INS_DATETIME,INS_PERSON_ID,UPD_DATETIME,UPD_PERSON_ID",
      EXCEL_COL_WIDTH: "autofit,autofit,autofit,autofit,150,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,100,200,200,200,autofit,autofit,150,100,150,100",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "NaN",
      EXCEL_DATE_COLS: "INS_DATETIME,UPD_DATETIME",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_NUMBER_COLS: "ITEM_CNT2",
      EXCEL_COL_ALIGN: "left,left,left,left,left,left,left,left,center,center,left,center,center,center,center,center,right,left,left,left,center,center,center,left,center,left",
      EXCEL_COL_HIDDEN: "",
      EXCEL_COL_COMBOCOLS: "WH_CD,WORK_SECT_TCD,STRG_RACK_TCD,WCELL_TYP,WCELL_TCD,WCELL_STRG_CD,HLD_SCD,MIXED_ITEM_YN,MIXED_LOT_YN,FULL_BOX_YN,WORK_SCTN_CD,STAGE_YN,USE_YN",
      EXCEL_COL_CHECKCOLS: "",
      EXCEL_HEADERMERGE: "",
      SES_LANG: "KO",
      SES_USERGROUP: "2000000300",
      SES_WHSE: "T01234",
      SES_MULTI_LANG_YN: "N",
    },
  },

  // ── 5. 상품별 전략관리 ────────────────────────────────────────────────────
  {
    slotKey: "product-strategy",
    label: "상품별 전략관리",
    type: "generic",
    pageUrl: "https://elogis.emart24.co.kr/",
    menuPath: ["창고관리 (WMS)", "기준정보", "상품", "상품별 전략 관리"],
    prepareParams: {
      PAGING: "N",
      CURRENT_MENUCODE: "WMS101421",
      CURRENT_MENUNAME: "MENU_MAS_STO::MENU_ITEM_STRATEGY_UPLOAD",
      DOWN_EXCEL_FILTERED_ROWS: "N",
      SEARCH_URL: "/itemStrategyUploadService/search",
      EXCEL_SHEET_TITLE: "MENU_MAS_STO::MENU_ITEM_STRATEGY_UPLOAD",
      EXCEL_HEADERCOLS: "WH_CD,STRR_ID,ITEM_CD,ITEM_NM,ITEMGRP_BNM,ITEMGRP_MNM,ITEMGRP_SNM,LOT_STG_CD,LOT_STG,LALOC_STG_CD,LALOC_STG,REPL_STG_CD,REPL_STG,PUTA_STG_CD,PUTA_STG,PUTA_WCELL_NO,REPL_WCELL_NO,CNT_REL_WCELL_NO,TASK_SECT_CD,TASK_SECT,INB_VALID_YN,OUTB_VALID_YN,INB_VALID_DAYS,OUTB_VALID_DAYS,INNER_BOX_RTAT_ENBL_YN,FULL_BOX_YN,PROD_VALID_DAYS,USE_YN",
      EXCEL_HEADERCOLS_TEXT: "창고코드*,화주사코드*,상품코드*,상품명,대분류명,중분류명,소분류명,로트 생성 전략 코드*,로트 생성 전략*,할당전략코드*,할당전략*,보충전략 코드*,보충전략*,적치전략 코드*,적치전략*,피킹셀,지정보충셀,복수지정셀 수,작업구분코드,작업구분,입고유효기간체크,출고유효기간체크,입고유효기간(일),출고유효기간(일),이너박스회전가능여부,완박스작업여부,제조유통기한일,사용여부",
      EXCEL_HEADER_DEPTH: "1",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_COLNAMES: "WH_CD,STRR_ID,ITEM_CD,ITEM_NM,ITEMGRP_BNM,ITEMGRP_MNM,ITEMGRP_SNM,LOT_STG_CD,LOT_STG_NM,LALOC_STG_ID,LALOC_STG_NM,REPL_STG_ID,REPL_STG_NM,PUTA_STG_ID,PUTA_STG_NM,PUTA_WCELL_NO,REPL_WCELL_NO,CNT_REL_WCELL_NO,WORK_SCTN_CD,WORK_SCTN_NAME,INB_VALID_YN,OUTB_VALID_YN,INB_VALID_PERID,OUTB_VALID_PERID,RTAT_ENBL_YN,FULL_BOX_YN,PROD_VALID_DAYS,USE_YN",
      EXCEL_COL_WIDTH: "autofit,autofit,autofit,250,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "NaN",
      EXCEL_DATE_COLS: "",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_NUMBER_COLS: "CNT_REL_WCELL_NO,INB_VALID_PERID,OUTB_VALID_PERID,PROD_VALID_DAYS",
      EXCEL_COL_ALIGN: "center,left,left,left,left,left,left,left,left,left,left,left,left,left,left,left,left,right,left,left,center,center,right,right,center,center,right,center",
      EXCEL_COL_HIDDEN: "",
      EXCEL_COL_COMBOCOLS: "INB_VALID_YN,OUTB_VALID_YN,RTAT_ENBL_YN,FULL_BOX_YN,USE_YN",
      EXCEL_COL_CHECKCOLS: "",
      EXCEL_HEADERMERGE: "",
      SES_LANG: "KO",
      SES_USERGROUP: "2000000300",
      SES_WHSE: "T01234",
      SES_MULTI_LANG_YN: "N",
    },
  },

  // ── 6. 재고현황 ───────────────────────────────────────────────────────────
  {
    slotKey: "inventory-status",
    label: "재고현황",
    type: "generic",
    pageUrl: "https://elogis.emart24.co.kr/",
    menuPath: ["창고관리 (WMS)", "재고", "재고조회", "재고현황", "재고현황"],
    prepareParams: {
      PAGING: "N",
      CURRENT_MENUCODE: "WMS141123",
      CURRENT_MENUNAME: "MENU_CMBN_INVN_SRCH::MENU_CMBN_INVN_STATUS",
      DOWN_EXCEL_FILTERED_ROWS: "N",
      SEARCH_URL: "/invnTotListService/searchAllStock",
      EXCEL_SHEET_TITLE: "MENU_CMBN_INVN_SRCH::MENU_CMBN_INVN_STATUS",
      EXCEL_HEADERCOLS:
        "WH_CD,WH_NM,ZONE_CD,ZONE_NM,WLOC_CD,LCELL_NO,STRR_ID,STRR_NM,ITEM_CD,ITEM_NM,ITEM_GCD,ITEM_GNM,ITEM_STRG_CD,INVN_SCD_NM,LOT_NO,LOT_HLD_SCD,INVN_QTY,LALOC_QTY,PRCS_QTY,ALL_HLD_QTY,INB_DATE,CONV_PRDT_DATE,VALID_DATETIME,WCELL_SCD,DCTC_TCD,RDC_CDC_PROD_TP,INVN_OLD_DAY,INV_TURNOVER_DT,AVG_DAY_SHIPMENT_CNT,SUPPR_ID,SUPPR_NM",
      EXCEL_HEADERCOLS_TEXT:
        "창고코드,창고명,존코드,존명,로케이션코드,셀,화주사코드,화주사명,상품코드,상품명,상품그룹코드,상품그룹명,상품저장코드,재고상태,로트번호,로트 보류상태,재고수량,가용수량,예약수량,보류수량,입고일자,제조일자(환산),소비기한,셀 보류상태,DC/TC,RDC/CDC,재고보유일수,재고회전일,일평균 출하수량,공급거래처,공급거래처명",
      EXCEL_HEADER_DEPTH: "1",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_COLNAMES:
        "WH_CD,WH_NM,ZONE_CD,ZONE_NM,WLOC_CD,LCELL_NO,STRR_ID,STRR_NM,ITEM_CD,ITEM_NM,ITEM_GCD,ITEM_GNM,ITEM_STRG_CD,INVN_SCD_NM,LOT_NO,LOT_HLD_SCD,INVN_QTY,LALOC_QTY,PRCS_QTY,ALL_HLD_QTY,INB_DATE,CONV_PRDT_DATE,VALID_DATETIME,WCELL_SCD,DCTC_TCD,RDC_CDC,INVN_OLD_DAY,INVN_TURNOVER_DD,AVG_OUT_QTY_DD,SUPPR_ID,SUPPR_NM",
      EXCEL_COL_WIDTH:
        "autofit,autofit,autofit,autofit,autofit,autofit,autofit,150,autofit,250,110,140,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,120,120,120,autofit,80,90,90,90,120,autofit,140",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "",
      EXCEL_DATE_COLS: "INB_DATE,CONV_PRDT_DATE,VALID_DATETIME",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_NUMBER_COLS:
        "INVN_QTY,LALOC_QTY,PRCS_QTY,ALL_HLD_QTY,INVN_OLD_DAY,INVN_TURNOVER_DD,AVG_OUT_QTY_DD,SKU_DECIMAL",
      EXCEL_COL_ALIGN:
        "center,left,left,left,left,left,left,left,left,left,center,left,left,center,center,left,right,right,right,right,center,center,center,center,center,center,right,right,right,center,left",
      EXCEL_COL_HIDDEN: "",
      EXCEL_COL_COMBOCOLS: "ITEM_STRG_CD,DCTC_TCD",
      EXCEL_COL_CHECKCOLS: "",
      EXCEL_HEADERMERGE: "",
      SES_LANG: "KO",
      SES_USERGROUP: "2000000300",
      SES_WHSE: "T01234",
      SES_MULTI_LANG_YN: "N",
    },
  },

  // ── 7. 상품별재고현황 ─────────────────────────────────────────────────────
  {
    slotKey: "product-inventory",
    label: "상품별재고현황",
    type: "generic",
    pageUrl: "https://elogis.emart24.co.kr/",
    menuPath: ["창고관리 (WMS)", "재고", "재고조회", "재고현황", "상품별 재고현황"],
    prepareParams: {
      PAGING: "N",
      CURRENT_MENUCODE: "WMS141123",
      CURRENT_MENUNAME: "MENU_CMBN_INVN_SRCH::MENU_CMBN_INVN_STATUS",
      DOWN_EXCEL_FILTERED_ROWS: "N",
      SEARCH_URL: "/invnTotListService/searchStockInvn",
      EXCEL_SHEET_TITLE: "MENU_CMBN_INVN_SRCH::MENU_CMBN_INVN_STATUS",
      EXCEL_HEADERCOLS: "WH_CD,WH_NM,STRR_ID,STRR_NM,ITEM_CD,ITEM_NM,ITEM_STRG_CD,INVN_SCD_NM,INVN_QTY,LALOC_QTY,PRCS_QTY,ALL_HLD_QTY",
      EXCEL_HEADERCOLS_TEXT: "창고코드,창고명,화주사코드,화주사명,상품코드,상품명,상품저장코드,재고상태,재고수량,가용수량,예약수량,보류수량",
      EXCEL_HEADER_DEPTH: "1",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_COLNAMES: "WH_CD,WH_NM,STRR_ID,STRR_NM,ITEM_CD,ITEM_NM,ITEM_STRG_CD,INVN_SCD_NM,INVN_QTY,LALOC_QTY,PRCS_QTY,ALL_HLD_QTY",
      EXCEL_COL_WIDTH: "autofit,autofit,autofit,150,autofit,250,autofit,autofit,autofit,autofit,autofit,autofit",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "",
      EXCEL_DATE_COLS: "",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_NUMBER_COLS: "INVN_QTY,LALOC_QTY,PRCS_QTY,ALL_HLD_QTY,SKU_DECIMAL",
      EXCEL_COL_ALIGN: "center,left,left,left,left,left,left,center,right,right,right,right",
      EXCEL_COL_HIDDEN: "",
      EXCEL_COL_COMBOCOLS: "ITEM_STRG_CD",
      EXCEL_COL_CHECKCOLS: "",
      EXCEL_HEADERMERGE: "",
      SES_LANG: "KO",
      SES_USERGROUP: "2000000300",
      SES_WHSE: "T01234",
      SES_MULTI_LANG_YN: "N",
    },
  },
];

module.exports = { FILE_CONFIGS };
