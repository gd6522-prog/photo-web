/**
 * elogis 파일 슬롯 설정
 *
 * 각 파일마다:
 *   slotKey      : admin 파일업로드 슬롯 키 (SLOT_CONFIGS 의 key)
 *   label        : 로그에 표시될 이름
 *   type         : 'generic' (R2 저장) | 'store-master' (DB 반영)
 *   pageUrl      : elogis 에서 해당 데이터를 조회하는 페이지 URL
 *   prepareOverride: commonExcelDownPrepare POST 파라미터를 override
 *                    (지정 시 intercept→API 방식으로 다운로드)
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
  },

  // ── 2. 상품마스터 ─────────────────────────────────────────────────────────
  {
    slotKey: "product-master",
    label: "상품마스터",
    type: "generic",
    pageUrl: "https://elogis.emart24.co.kr/",
    menuPath: ["즐겨찾기", "마스터관리 (MDM)", "상품관리", "상품"],
    prepareOverride: {
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

  // ── 3. 취급상품 마스터 (메뉴 클릭 + 검색 입력 후 3단계 API) ────
  {
    slotKey: "workcenter-product-master",
    label: "취급상품 마스터",
    type: "generic",
    pageUrl: "https://elogis.emart24.co.kr/",
    menuPath: ["즐겨찾기", "마스터관리 (MDM)", "상품관리", "작업센터 취급상품 마스터"],
    searchInputs: [
      {
        label: "작업센터코드",
        value: "901234,901235,901237,901238,901239,901240,901363",
        selector: '[name="TASK_CENT_CD"]',
        condition: "포함",   // = 버튼 → 데이터 비교조건 패널 → 포함 선택
      },
    ],
    prepareOverride: {
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
    prepareOverride: {
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
    prepareOverride: {
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
    menuPath: ["창고관리 (WMS)", "재고", "재고조회", "재고현황"],  // 재고현황 탭이 기본값
    prepareOverride: {
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
    // UI가 엑셀 버튼 클릭 시 재고현황 파라미터를 보냄 → 상품별재고현황으로 강제 교체
    prepareOverride: {
      SEARCH_URL: "/invnTotListService/searchStockInvn",
      CURRENT_MENUCODE: "WMS141123",
      CURRENT_MENUNAME: "MENU_CMBN_INVN_SRCH::MENU_CMBN_INVN_STATUS",
      EXCEL_HEADERCOLS: "WH_CD,WH_NM,STRR_ID,STRR_NM,ITEM_CD,ITEM_NM,ITEM_STRG_CD,INVN_SCD_NM,INVN_QTY,LALOC_QTY,PRCS_QTY,ALL_HLD_QTY",
      EXCEL_HEADERCOLS_TEXT: "창고코드,창고명,화주사코드,화주사명,상품코드,상품명,상품저장코드,재고상태,재고수량,가용수량,예약수량,보류수량",
      EXCEL_COLNAMES: "WH_CD,WH_NM,STRR_ID,STRR_NM,ITEM_CD,ITEM_NM,ITEM_STRG_CD,INVN_SCD_NM,INVN_QTY,LALOC_QTY,PRCS_QTY,ALL_HLD_QTY",
      EXCEL_COL_WIDTH: "autofit,autofit,autofit,150,autofit,250,autofit,autofit,autofit,autofit,autofit,autofit",
      EXCEL_NUMBER_COLS: "INVN_QTY,LALOC_QTY,PRCS_QTY,ALL_HLD_QTY",
      EXCEL_COL_ALIGN: "center,left,left,left,left,left,left,center,right,right,right,right",
      EXCEL_COL_COMBOCOLS: "ITEM_STRG_CD",
      EXCEL_COL_HIDDEN: "",
      EXCEL_HEADER_DEPTH: "1",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "",
      EXCEL_DATE_COLS: "",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_COL_CHECKCOLS: "",
      EXCEL_HEADERMERGE: "",
    },
  },
  // ── 8. 발주기준정보관리 ───────────────────────────────────────────────────
  {
    slotKey: "po-std-master",
    label: "발주기준정보관리",
    type: "generic",
    pageUrl: "https://elogis.emart24.co.kr/",
    menuPath: ["주문관리 (OMS)", "기준정보", "리오더발주관리", "발주기준정보관리"],
    prepareOverride: {
      PAGING: "N",
      CURRENT_MENUCODE: "OM102070",
      CURRENT_MENUNAME: "MENU_REORDER::MENU_PO_STD_MASTER",
      DOWN_EXCEL_FILTERED_ROWS: "N",
      SEARCH_URL: "/poStdMasterService/search",
      EXCEL_SHEET_TITLE: "MENU_REORDER::MENU_PO_STD_MASTER",
      EXCEL_HEADERCOLS: "STRR_ID,WH_CD,WH_NM,ITEM_CD,ITEM_NM,ITEMGRP_BCD,ITEMGRP_BNM,ITEMGRP_MCD,ITEMGRP_MNM,ITEMGRP_SCD,ITEMGRP_SNM,SUPPR_ID,SUPPR_NM,CENT_ORD_ENBL_YN_SUPPR,CENT_ORD_ENBL_DAY_SUPPR,DOW_MON,DOW_TUE,DOW_WED,DOW_THU,DOW_FRI,DOW_SAT,DOW_SUN,STR_ORD_ENBL_YN_SUPPR,STR_ORD_ENBL_DAY_SUPPR,OUTB_QTY,SMPL_AVG_OUT,MIN,MAX,MIN,MAX,EXP_TP_CD,EXP_APPLY_YN,PLT_FLOOR,PLT_ACQ,PLT_FLOOR,PLT_ACQ,ORD_ACQ_UNIT_QTY,RE_ORD_UNIT,REORDER_SRCH_YN,PLT_FLOOR_YN,STR_ORD_EXCP_ENBL_YN,USE_YN,INS_DATETIME,INS_PERSON_ID,UPD_DATETIME,UPD_PERSON_ID",
      EXCEL_HEADERCOLS_TEXT: "화주사코드*,창고코드,창고명,상품코드,상품명,대분류코드,대분류명,중분류코드,중분류명,소분류코드,소분류명,공급거래처,공급거래처명,센터발주가능여부<br>(작업센터상품취급마스터),거래처발주가능요일<br>(공급사리드타임),월,화,수,목,금,토,일,점포발주가능여부<br>(작업센터상품취급마스터),점포발주가능요일<br>(공급사리드타임),출고수량,단순평균출고,최소,최대,최소,최대,예외발주구분,단품별적용여부,PLT(단),PLT,PLT(단),PLT,센터발주입수,리오더 발주단위(기본 : BOX),리오더발주 조회여부,PLT/단적용여부,특정점포발주가능여부,사용여부,입력일시,입력자 ID,수정일시,수정자 ID",
      EXCEL_HEADER_DEPTH: "2",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_COLNAMES: "STRR_ID,WH_CD,WH_NM,ITEM_CD,ITEM_NM,ITEMGRP_BCD,ITEMGRP_BNM,ITEMGRP_MCD,ITEMGRP_MNM,ITEMGRP_SCD,ITEMGRP_SNM,SUPPR_ID,SUPPR_NM,CENT_ORD_ENBL_YN,CENT_ORD_ENBL_WEEK,MON_LT,TUE_LT,WED_LT,THU_LT,FRI_LT,SAT_LT,SUN_LT,STR_ORD_ENBL_YN,CUST_ORD_ENBL_WEEK,OUTB_QTY,SMPL_AVG_OUT,SAFE_STCK_MIN_DAYS,SAFE_STCK_MAX_DAYS,SAFG_STCK_MIN_DAYS,SAFG_STCK_MAX_DAYS,EXP_TP_CD,APPLY_YN,PLT_FLOOR_QTY,PLT_ACQ_QTY,ITEM_PLT_FLOOR_QTY,ITEM_PLT_ACQ_QTY,ORD_ACQ_UNIT_QTY,ORD_UNIT,REORDER_SRCH_YN,PLT_FLOOR_YN,STR_ORD_EXCP_ENBL_YN,USE_YN,INS_DATETIME,INS_PERSON_ID,UPD_DATETIME,UPD_PERSON_ID",
      EXCEL_COL_WIDTH: "100,100,100,99,100,100,100,100,100,100,100,100,92,autofit,autofit,60,60,60,60,60,60,60,autofit,autofit,autofit,autofit,80,80,80,80,autofit,autofit,80,80,80,80,100,autofit,autofit,autofit,autofit,autofit,130,autofit,130,autofit",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "7",
      EXCEL_DATE_COLS: "INS_DATETIME,UPD_DATETIME",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_NUMBER_COLS: "MON_LT,TUE_LT,WED_LT,THU_LT,FRI_LT,SAT_LT,SUN_LT,OUTB_QTY,SMPL_AVG_OUT,SAFE_STCK_MIN_DAYS,SAFE_STCK_MAX_DAYS,SAFG_STCK_MIN_DAYS,SAFG_STCK_MAX_DAYS,PLT_FLOOR_QTY,PLT_ACQ_QTY,ITEM_PLT_FLOOR_QTY,ITEM_PLT_ACQ_QTY,ORD_ACQ_UNIT_QTY",
      EXCEL_COL_ALIGN: "center,center,left,center,left,center,left,center,left,center,left,center,left,left,left,right,right,right,right,right,right,right,left,left,right,right,right,right,right,right,left,center,right,right,right,right,right,left,center,center,left,center,center,left,center,left",
      EXCEL_COL_HIDDEN: "",
      EXCEL_COL_COMBOCOLS: "STRR_ID,EXP_TP_CD,APPLY_YN,ORD_UNIT,REORDER_SRCH_YN,USE_YN",
      EXCEL_COL_CHECKCOLS: "PLT_FLOOR_YN",
      EXCEL_HEADERMERGE: "0,1,0,0#0,1,1,1#0,1,2,2#0,1,3,3#0,1,4,4#0,0,5,10#0,1,11,11#0,1,12,12#0,1,13,13#0,1,14,14#0,0,15,21#0,1,22,22#0,1,23,23#0,0,24,25#0,0,26,27#0,0,28,31#0,0,32,33#0,0,34,35#0,1,36,36#0,1,37,37#0,1,38,38#0,1,39,39#0,1,40,40#0,1,41,41#0,1,42,42#0,1,43,43#0,1,44,44#0,1,45,45",
      EXCEL_HEADER_GROUP_0: "STRR_ID,WH_CD,WH_NM,ITEM_CD,ITEM_NM,ITEM_CATE,ITEM_CATE,ITEM_CATE,ITEM_CATE,ITEM_CATE,ITEM_CATE,SUPPR_ID,SUPPR_NM,CENT_ORD_ENBL_YN_SUPPR,CENT_ORD_ENBL_DAY_SUPPR,CENT_TIME_SUPPR,CENT_TIME_SUPPR,CENT_TIME_SUPPR,CENT_TIME_SUPPR,CENT_TIME_SUPPR,CENT_TIME_SUPPR,CENT_TIME_SUPPR,STR_ORD_ENBL_YN_SUPPR,STR_ORD_ENBL_DAY_SUPPR,14DAYS_AGO,14DAYS_AGO,SNM_SAFT_STCK_QTY,SNM_SAFT_STCK_QTY,DAYS_SAFT_STCK_QTY,DAYS_SAFT_STCK_QTY,DAYS_SAFT_STCK_QTY,DAYS_SAFT_STCK_QTY,ITEM_PLT_ACQ_QTY,ITEM_PLT_ACQ_QTY,ITEM_MASTER_PLT_QTY,ITEM_MASTER_PLT_QTY,ORD_ACQ_UNIT_QTY,RE_ORD_UNIT,REORDER_SRCH_YN,PLT_FLOOR_YN,STR_ORD_EXCP_ENBL_YN,USE_YN,INS_DATETIME,INS_PERSON_ID,UPD_DATETIME,UPD_PERSON_ID",
      SES_LANG: "KO",
      SES_USERGROUP: "2000000300",
      SES_WHSE: "T01234",
      SES_MULTI_LANG_YN: "N",
    },
  },
  // ── 9. 입고예정 ───────────────────────────────────────────────────────────
  // uiDateRange 로 UI 세션 날짜를 먼저 갱신한 뒤, prepareOverride 로 commonExcelDownPrepare 를
  // intercept→API 재전송. dynamicParams 가 매 호출마다 KST 기준 D~D+3 날짜를 동적 주입.
  {
    slotKey: "inbound-status",
    label: "입고예정",
    type: "generic",
    pageUrl: "https://elogis.emart24.co.kr/",
    menuPath: ["창고관리 (WMS)", "보고", "실적", "입고현황"],
    uiDateRange: [
      { label: "입고예정일From", extName: "INB_ECT_DATE", extIndex: 0, daysOffset: 0 },
      { label: "입고예정일To",   extName: "INB_ECT_DATE", extIndex: 1, daysOffset: 2 },
    ],
    dynamicParams: () => {
      const kstFmt = (offsetDays) => {
        const kst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
        kst.setDate(kst.getDate() + offsetDays);
        return `${kst.getFullYear()}${String(kst.getMonth()+1).padStart(2,"0")}${String(kst.getDate()).padStart(2,"0")}`;
      };
      return { INB_ECT_FROM: kstFmt(0), INB_ECT_TO: kstFmt(3) };
    },
    prepareOverride: {
      SQL_ID: "SELECT_INB_STATUS_LIST",
      WH_CD: "T01234",
      PAGING: "N",
      CURRENT_MENUCODE: "WMS171610",
      CURRENT_MENUNAME: "MENU_PERFORMANCE::MENU_INB_STATUS",
      DOWN_EXCEL_FILTERED_ROWS: "N",
      SEARCH_URL: "/reportService/searchReport",
      EXCEL_SHEET_TITLE: "MENU_PERFORMANCE::MENU_INB_STATUS",
      EXCEL_HEADERCOLS: "WH_CD,WH_NM,FROM_WH_CD2,FROM_WH_NM2,INB_NO,INB_DETL_NO,INB_ECT_DATE,INB_DATE,ORD_TCD,INB_TCD,RTRN_TCD,SUPPR_ID,SUPPR_NM,ITEMGRP_BCD,ITEMGRP_BNM,ITEM_CD,ITEM_NM,ORDER_TYPE,INB_DETL_SCD,SHORTAGE_SCD,QTY,AMT,QTY,AMT,QTY,AMT,VALID_DATETIME,UNRECEIVE_TCD,UNRECEIVE_REMARK,WCELL_WORK_EMPTY_YN,UPD_DATETIME,UPD_PERSON_ID",
      EXCEL_HEADERCOLS_TEXT: "창고코드,창고명,FROM 창고코드,FROM 창고명,입고번호,입고상세번호,입고예정일자,입고일자,전표구분,입고유형,반품유형,공급거래처,공급거래처명,대분류코드,대분류명,상품코드,상품명,발주구분,입고상세상태,결품상태,수량,금액,수량,금액,수량,금액,소비기한,미입고사유,미입고상세내용,피킹셀/작업구분 미등록 여부,수정일시,수정자 ID",
      EXCEL_HEADER_DEPTH: "2",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_COLNAMES: "WH_CD,WH_NM,FROM_WH_CD,FROM_WH_NM,INB_NO,INB_DETL_NO,SHOW_INB_ECT_DATE,SHOW_INB_DATE,ORD_TCD,INB_TCD,SLIP_TP_CD,SUPPR_ID,SUPPR_NM,ITEMGRP_BCD,ITEMGRP_BNM,ITEM_CD,ITEM_NM,ORD_TP_NM,INB_DETL_SCD,SHOW_SHORTAGE_SCD,ORD_QTY,ORD_PRICE,INB_QTY,INB_PRICE,MISS_QTY,MISS_PRICE,VALID_DATETIME,UINB_REASON_CD,UINB_DETL_DESCR,WCELL_WORK_EMPTY_YN,UPD_DATETIME,UPD_PERSON_ID",
      EXCEL_COL_WIDTH: "autofit,autofit,autofit,autofit,autofit,autofit,120,120,autofit,autofit,autofit,autofit,200,autofit,autofit,140,180,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,autofit,120,140,130,150,150,autofit",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "",
      EXCEL_DATE_COLS: "SHOW_INB_ECT_DATE,SHOW_INB_DATE,VALID_DATETIME",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_NUMBER_COLS: "INB_DETL_NO,ORD_QTY,ORD_PRICE,INB_QTY,INB_PRICE,MISS_QTY,MISS_PRICE",
      EXCEL_COL_ALIGN: "center,center,center,left,center,right,center,center,center,left,left,center,left,left,left,left,left,left,center,center,right,right,right,right,right,right,center,left,left,center,left,left",
      EXCEL_COL_HIDDEN: "",
      EXCEL_COL_COMBOCOLS: "ORD_TCD,INB_TCD,SLIP_TP_CD,INB_DETL_SCD,SHOW_SHORTAGE_SCD,UINB_REASON_CD",
      EXCEL_COL_CHECKCOLS: "",
      EXCEL_HEADERMERGE: "0,1,0,0#0,1,1,1#0,1,2,2#0,1,3,3#0,1,4,4#0,1,5,5#0,1,6,6#0,1,7,7#0,1,8,8#0,1,9,9#0,1,10,10#0,1,11,11#0,1,12,12#0,1,13,13#0,1,14,14#0,1,15,15#0,1,16,16#0,1,17,17#0,1,18,18#0,1,19,19#0,0,20,21#0,0,22,23#0,0,24,25#0,1,26,26#0,1,27,27#0,1,28,28#0,1,29,29#0,1,30,30#0,1,31,31",
      EXCEL_HEADER_GROUP_0: "WH_CD,WH_NM,FROM_WH_CD2,FROM_WH_NM2,INB_NO,INB_DETL_NO,INB_ECT_DATE,INB_DATE,ORD_TCD,INB_TCD,RTRN_TCD,SUPPR_ID,SUPPR_NM,ITEMGRP_BCD,ITEMGRP_BNM,ITEM_CD,ITEM_NM,ORDER_TYPE,INB_DETL_SCD,SHORTAGE_SCD,LABEL_ORDER,LABEL_ORDER,INBOUND,INBOUND,SHORTAGE,SHORTAGE,VALID_DATETIME,UNRECEIVE_TCD,UNRECEIVE_REMARK,WCELL_WORK_EMPTY_YN,UPD_DATETIME,UPD_PERSON_ID",
      SES_LANG: "KO",
      SES_USERGROUP: "2000000300",
      SES_WHSE: "T01234",
      SES_MULTI_LANG_YN: "N",
    },
  },
  // ── 10. DPS 작업현황 (DOM 스크래핑) ──────────────────────────────────────
  {
    slotKey: "dps-status",
    label: "DPS 작업현황",
    type: "dom-scrape",
    domScrape: true,
    internalEndpoint: "/api/internal/dps-status",
    pageUrl: "https://elogis.emart24.co.kr/",
    menuPath: ["창고관리 (WMS)", "출고", "설비작업지시", "설비작업현황", "DPS 작업현황"],
  },

  // ── 11. 점포별물류비조회(일)_작업구분별 (BMS, 기준일자 D-2) ─────────────────
  // 활성 탭이 의도와 달리 점포별/상품별로 떨어지는 문제 대응:
  // prepareOverride 로 commonExcelDownPrepare 를 가로채 작업구분별 탭의 컬럼/메뉴 메타데이터를 강제.
  // SEARCH_URL 은 캡처된 원본 그대로 사용 (활성 탭에 따라 자동 결정) — 원본 SEARCH_URL 은 _prepare_body_*.txt 와 [PREPARE-원본] 로그로 확인 가능.
  {
    slotKey: "logistics-cost-by-store",
    label: "점포별물류비조회",
    fileNameLabel: "물류비조회_작업구분별",
    type: "generic",
    // 일요일에도 자동 실행 (다른 슬롯은 일요일 skip 이 기본)
    runOnSunday: true,
    pageUrl: "https://elogis.emart24.co.kr/",
    menuPath: ["정산관리 (BMS)", "물류용역수수료", "점포별물류비조회(일)", "점포별/일자별/작업구분별"],
    uiDateSearch: { label: "기준일자", extName: "A.BASE_YMD", daysOffset: -2, waitAfterSearch: 10000 },
    downloadMenuText: "현재 그리드 데이터 다운로드",
    allRowsBeforeDownload: true,
    prepareOverride: {
      PAGING: "N",
      CURRENT_MENUCODE: "BMS151700",
      CURRENT_MENUNAME: "MENU_LOGISCOST_TOTAL::MENU_BMS_STORE_BY_LOGISCOST_SEARCH_DAY",
      DOWN_EXCEL_FILTERED_ROWS: "N",
      EXCEL_SHEET_TITLE: "MENU_LOGISCOST_TOTAL::MENU_BMS_STORE_BY_LOGISCOST_SEARCH_DAY",
      EXCEL_HEADERCOLS: "CENT_NM,OUTB_ECT_DATE,STOR_CD,STOR_NM,ADJST_NM,WORK_SCTN_NM,ITEMGRP_BNM,ORD_QTY_01,NO_VAT_ORDER_AMT,VAT_ORDER_AMT,OUTB_CMPT_QTY,OUTB_MOQ,STORECONFIRM_QTY,NO_VAT_OUTB_CMPT_AMT,BMS_OUTB_AMT,BMS_CUST_CNFM_AMT_VAT,BMS_CUST_CNFM_AMT_EX_VAT,BMS_OUTB_ORG_AMT",
      EXCEL_HEADERCOLS_TEXT: "센터명,납품예정일,점포코드,점포명,조정분류명,작업구분명,대분류명,발주수량,발주금액(VAT제외),발주금액(VAT포함),출고수량,출고배수,점포확정수량,출고금액(VAT제외),출고금액(VAT포함),점포확정금액(VAT포함),점포확정금액(VAT제외),출고원가(VAT제외)",
      EXCEL_HEADER_DEPTH: "1",
      EXCEL_REQUIRED_HEADERS: "",
      EXCEL_COLNAMES: "WH_CD,OUTB_DATE_YMD,CUST_ID,CUST_NM,ADJST_NM,WORK_SCTN_NM,ITEMGRP_BNM,ORDER_QTY,NO_VAT_ORDER_AMT,ORDER_AMT,OUTB_CMPT_QTY,OUTB_CMPT_QTY_MOQ,CUST_CNFM_QTY,NO_VAT_OUTB_CMPT_AMT,OUTB_CMPT_AMT,CUST_CNFM_AMT,BMS_CUST_CNFM_AMT_EX_VAT,SHIP_AMT",
      EXCEL_COL_WIDTH: "100,100,100,140,140,100,100,80,140,140,100,100,100,145,145,145,145,145",
      EXCEL_EDIT_FALSE_COLS: "",
      EXCEL_FIXED_COLS: "",
      EXCEL_DATE_COLS: "OUTB_DATE_YMD",
      EXCEL_DATE_COLS_FORMAT: "",
      EXCEL_NUMBER_COLS: "ORDER_QTY,NO_VAT_ORDER_AMT,ORDER_AMT,OUTB_CMPT_QTY,OUTB_CMPT_QTY_MOQ,CUST_CNFM_QTY,NO_VAT_OUTB_CMPT_AMT,OUTB_CMPT_AMT,CUST_CNFM_AMT,BMS_CUST_CNFM_AMT_EX_VAT,SHIP_AMT",
      EXCEL_COL_ALIGN: "center,center,center,left,left,left,center,right,right,right,right,right,right,right,right,right,right,right",
      EXCEL_COL_HIDDEN: "",
      EXCEL_COL_COMBOCOLS: "WH_CD",
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
