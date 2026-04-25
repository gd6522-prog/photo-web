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
    menuPath: ["즐겨찾기", "마스터관리 (MDM)", "상품관리", "상품"],
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
    menuPath: ["즐겨찾기", "마스터관리 (MDM)", "상품관리", "작업센터 취급상품 마스터"],
    searchInputs: [
      {
        label: "작업센터코드",
        value: "901234,901235,901237,901238,901239,901240,901363",
        selector: '[name="TASK_CENT_CD"]',
        condition: "포함",   // = 버튼 → 데이터 비교조건 패널 → 포함 선택
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
    menuPath: ["창고관리 (WMS)", "재고", "재고조회", "재고현황"],  // 재고현황 탭이 기본값
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
    prepareParams: {
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
  // 서버가 session 기준으로 검색하므로, UI에서 직접 날짜 설정 + 조회 후 다운로드
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
  // BMS는 commonExcelDownPrepare를 쓰지 않으므로 브라우저 다운로드 이벤트 방식 사용
  {
    slotKey: "logistics-cost-by-store",
    label: "점포별물류비조회(일)_작업구분별",
    type: "generic",
    pageUrl: "https://elogis.emart24.co.kr/",
    menuPath: ["정산관리 (BMS)", "물류용역수수료", "점포별물류비조회(일)", "점포별/일자별/작업구분별"],
    uiDateSearch: { label: "기준일자", extName: "A.BASE_YMD", daysOffset: -2, waitAfterSearch: 10000 },
    downloadMenuText: "현재 그리드 데이터 다운로드",
  },
];

module.exports = { FILE_CONFIGS };
