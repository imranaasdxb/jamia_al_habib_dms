-- Run the entire file as the Neon database owner after the fundraiser identity correction.
-- Source: Money Receipt Data Entry-fundraisers correction.xlsm, COLLECTION rows 2–322.
-- Finished/blank close the book. Continue stays open. Matched zero-use returns release the full range.
BEGIN;
SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF (SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.book_returns'::regclass) <> current_user::regrole::oid THEN
    RAISE EXCEPTION 'Run this file as the owner of the application tables';
  END IF;
END $$;

SELECT pg_advisory_xact_lock(hashtext('dms:import:Book3_v1'));
LOCK TABLE public.books, public.book_cases, public.book_returns, public.book_assignments,
  public.people, public.fundraisers, public.master_records, public.legacy_collection_imports, public.book_receipts,
  public.leftover_books, public.book_flags, public.receipt_issues IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE dms_finished_source (
  excel_row integer PRIMARY KEY, book_number text, book_type text, edition text, fundraiser text,
  condition text NOT NULL DEFAULT 'Finished', collection_rupees numeric
) ON COMMIT DROP;
INSERT INTO dms_finished_source (excel_row,book_number,book_type,edition,fundraiser) VALUES
  (3,'669','Common','5th','Qamrul Islam'),
  (4,'668','Common','5th','Qamrul Islam'),
  (5,'657','Common','5th','Aasik Khan'),
  (8,'317','Common','4th','Mohammad Raza'),
  (9,'318','Common','4th','Mohammad Raza'),
  (10,'649','Common','5th','Zahir'),
  (13,'38','Common','6th','Maulana Raunaque'),
  (14,'37','Common','6th','Maulana Raunaque'),
  (15,'461','Common','4th','Maulana Azizul Karim'),
  (16,'443','Common','5th','Shaikh Akmal Husain'),
  (17,'11','Common','6th','Shaikh Gholam Rabbani'),
  (18,'108','Common','2nd','Hafiz Salim'),
  (19,'42','Common','6th','Shaikh Gholam Rabbani'),
  (20,'24','Common','6th','Shaikh Gholam Rabbani'),
  (21,'25','Common','6th','Shaikh Gholam Rabbani'),
  (22,'26','Common','6th','Shaikh Gholam Rabbani'),
  (23,'44','Common','6th','Shaikh Gholam Rabbani'),
  (24,'20','Common','6th','Shaikh Gholam Rabbani'),
  (25,'19','Common','6th','Shaikh Gholam Rabbani'),
  (26,'22','Common','6th','Maulana Qasim Ali'),
  (27,'16','Common','6th','Aasik Khan'),
  (28,'17','Common','6th','Aasik Khan'),
  (29,'441','Common','4th','Aasik Khan'),
  (30,'12','Common','6th','Maulana Gholam Ahmad Raza'),
  (31,'688','Common','5th','Maulana Ahmad Raza'),
  (32,'9','Common','6th','Tauseef Raza'),
  (33,'499','Common','5th','Tauseef Raza/Salahuddin'),
  (34,'41','Common','6th','Tauseef Raza'),
  (35,'10','Common','6th','Tauseef Raza'),
  (36,'29','Common','6th','Quari Gholam Ghaus'),
  (37,'30','Common','6th','Aasik Khan'),
  (38,'6','Common','6th','Shaikh Gholam Rabbani'),
  (39,'200','T100','1st','Ziauddin Shaikh'),
  (40,'2','Khoraki','1st','Quari Bilal Ahmad'),
  (41,'497','Common',NULL,'Moiz Aalam'),
  (42,'32','Common','6th','Maulana Abu Tahir'),
  (43,'35','Common','6th','Maulana Abu Tahir'),
  (44,'36','Common','6th','Maulana Abu Tahir'),
  (45,'494','Common','4th','Meraj'),
  (46,'707','Common','5th','Shoib Alam'),
  (47,'466','Common','4th','Shoaib Alam'),
  (48,'490','Common','4th','Abu Salik'),
  (49,'421','Common','4th','Aasik Khan'),
  (50,'703','Common','5th','Tajuddin Khan'),
  (51,'498','Common','5th','Moiz Aalam'),
  (52,'4','Common','6th','Quari Bilal Ahmad'),
  (53,'5','Common','6th','Quari Bilal Ahmad'),
  (54,'424','Common','4th','Quari Bilal Ahmad'),
  (55,'492','Common','4th','Quari Bilal Ahmad'),
  (56,'1','Common','6th','Quari Bilal Ahmad'),
  (57,'673','Common','6th','Quari Bilal Ahmad'),
  (58,'464','Common','6th','Quari Bilal Ahmad'),
  (59,'3','Common','6th','Quari Bilal Ahmad'),
  (60,'2','Common','6th','Quari Bilal Ahmad'),
  (61,'8','Common','6th','Quari Bilal Ahmad'),
  (64,'13','Common','6th','Shaikh Riyazat Husain'),
  (65,'43','Common','6th','Sona Bhai'),
  (66,'488','Common','5th','Imran'),
  (67,'489','Common','5th','Imran'),
  (68,'481','Common','5th','Wajid Khan'),
  (69,'482','Common','5th','Wajid Khan'),
  (70,'480','Common','5th','Ghulam Khaja'),
  (71,'667','Common','5th','Aasik Khan'),
  (72,'27','Common','6th','Aasik Khan'),
  (76,'47','Common','6th','Shaikh Gholam Rabbani'),
  (77,'48','Common','6th','Aasik Khan'),
  (78,'637','Common','5th','Tabrez/Wasim'),
  (79,'23','Common','6th','Qasim'),
  (83,'49','Common','6th','Aasik Khan'),
  (84,'14','Common','5th','Qamrul Islam'),
  (85,'15','Common','6th','Qamrul Islam'),
  (86,'470','Common','4th','Zahiruddin'),
  (87,'261','Common','6th','Shaikh Riyazat Husain'),
  (88,'21','Common','6th','Shaikh Gholam Rabbani'),
  (89,'55','Common','6th','Aasik Khan'),
  (90,'479','Common','4th','Naimuddin'),
  (91,'31','Common','6th','Aasik Khan'),
  (93,'56','Common','6th','Shaikh Gholam Rabbani'),
  (94,'252','Common','6th','Aasik Khan'),
  (95,'61','Common','6th','Shaikh Gholam Rabbani'),
  (96,'478','Common','4th','Salman'),
  (97,'54','Common','6th','Aasik Khan'),
  (98,'58','Common','6th','Aasik Khan'),
  (99,'440','Common','4th','Shaikh Riyazat Husain'),
  (100,'124','Common','6th','Shaikh Gholam Rabbani'),
  (101,'122','Common','6th','Shaikh Gholam Rabbani'),
  (102,'125','Common','6th','Shaikh Gholam Rabbani'),
  (103,'126','Common','6th','Shaikh Gholam Rabbani'),
  (104,'661','Common','6th','Shaikh Gholam Rabbani'),
  (105,'143','Common','6th','Shaikh Gholam Rabbani'),
  (106,'127','Common','6th','Shaikh Gholam Rabbani'),
  (107,'133','Common','6th','Shaikh Gholam Rabbani'),
  (108,'146','Common','6th','Shaikh Gholam Rabbani'),
  (109,'147','Common','6th','Mahboob Alam'),
  (110,'91','Common','6th','Quari Gholam Ghaus'),
  (111,'92','Common','6th','Aasik Khan'),
  (113,'373','Common','2nd','Imtiyaz'),
  (115,'141','Common','6th','Maulana Raunaq'),
  (116,'142','Common','6th','Maulana Raunaq'),
  (117,'150','Common','6th','Maulana Raunaq'),
  (118,'72','Common','6th','Maulana Raunaq'),
  (119,'137','Common','6th','Aasik Khan'),
  (120,'132','Common','6th','Quari Faizan Raza'),
  (123,'64','Common','6th','Hafiz Qasim'),
  (125,'62','Common','6th','Sona Bhai'),
  (126,'93','Common','6th','Aasik Khan'),
  (127,'135','Common','6th','Aasik Khan'),
  (128,'138','Common','6th','Aasik Khan'),
  (129,'219','T100','1st','Abu Sufyan'),
  (130,'119','T50','1st','Abu Sufyan'),
  (131,'94','Common','6th','Abu Sufyan'),
  (132,'73','Common','6th','Maulana Abu Tahir'),
  (133,'108','Common','6th','Modassir'),
  (134,'112','Common','6th','Khwaja'),
  (135,'115','T50','1st','Yasin'),
  (136,'129','Common','6th','Bashirul Hasan'),
  (137,'130','Common','6th','Bashirul Hasan'),
  (138,'128','Common','6th','Bashirul Hasan'),
  (139,'107','Common','6th','Yasin'),
  (140,'50','Common','6th','Aasik Khan'),
  (141,'59','Common','6th','Aasik Khan'),
  (142,'106','Common','6th','Salman Raza'),
  (143,'215','T100','1st','Sufyan Raza'),
  (144,'114','T50','1st','Sufyan'),
  (145,'113','T50','1st','Salman Raza'),
  (146,'134','Common','6th','Aasik Khan'),
  (147,'87','Common','6th','Faizan'),
  (149,'71','Common','6th','Maulana Azizul Karim'),
  (150,'117','Common','6th','Meraj Ahmad'),
  (151,'100','Common','6th','Asrar Ahmad'),
  (152,'220','Common','6th','Meraj Ahmad'),
  (153,'120','T50','1st','Gulzar Ahmad'),
  (154,'82','Common','6th','Sayed Abdul Aziz'),
  (155,'88','Common','6th','Rehan Raza'),
  (156,'(Missed by Collector)90','Common','6th','Ahmad Raza'),
  (158,'117','Common','6th','Nurul Qamar'),
  (159,'139','Common','6th','Mujahid Raza'),
  (161,'98','Common','6th','Rehan Raza'),
  (162,'99','Common','6th','Rehan Raza'),
  (163,'7','Common','6th','Maulana Abdullah'),
  (164,'418','Common','4th','Maulana Abdullah'),
  (165,'86','Common','6th','Faizan Raza'),
  (166,'89','Common','6th','Gulzar Ahmad'),
  (167,'96','Common','6th','Hasnain Raza'),
  (168,'120','Common','6th','Maulana Ilyas Misbahi'),
  (169,'119','Common','6th','Maulana Ilyas'),
  (170,'84','Common','6th','Imran Raza'),
  (171,'121','Common','6th','Maulana Ilyas'),
  (172,'66','Common','6th','Tahir Raza'),
  (173,'217','T100','1st','Sarfaraz'),
  (174,'116','T50','1st','Arshad Mullah'),
  (175,'117','T50','1st','Sarfaraz'),
  (176,'118','T50','1st','Ramzani'),
  (177,'218','T100','1st','Ramzani'),
  (188,'689','Common','6th','Subhani'),
  (191,'53','Common','6th','Aasik Khan'),
  (192,'201','T100','1st','Shaikh Riyazat Husain'),
  (193,'52','Common','6th','Arif Hussain'),
  (194,'111','Common','6th','Sharafat'),
  (195,'105','Common','6th','Mujahid'),
  (196,'70','Common','6th','Ershad Naimi'),
  (197,'60','Common','6th','Shaikh Gholam Rabbani'),
  (198,'662','Common','4th','Aasik Khan'),
  (199,'430','Common','5th','Dilbar Raza'),
  (201,'8','T50','1st','Shahid'),
  (202,'233','T100','1st','Shahid'),
  (203,'148','Common','6th','Aasik Khan'),
  (204,'118','Common','6th','Irfan Raza'),
  (205,'442','Common','5th','Aasik Khan'),
  (206,'136','Common','6th','Aasik Khan'),
  (207,'113','Common','6th','Imran Raza'),
  (213,'131','Common','6th','Aasik Khan'),
  (214,'107','T50','1st','Ziauddin'),
  (215,'152','Common','6th','Shaikh Gholam Rabbani'),
  (217,'154','Common','6th','Aasik Khan'),
  (218,'155','Common','6th','Aasik Khan'),
  (219,'156','Common','6th','Shaikh Gholam Rabbani'),
  (220,'153','Common','6th','Aasik Khan'),
  (221,'158','Common','6th','Aasik Khan'),
  (222,'160','Common','6th','Aasik Khan'),
  (223,'161','Common','6th','Aasik Khan'),
  (224,'157','Common','6th','Aasik Khan'),
  (225,'242','Common',NULL,'Shaikh Gholam Rabbani'),
  (226,'239','Common','6th','Shaikh Gholam Rabbani'),
  (227,'241','Common','6th','Shaikh Gholam Rabbani'),
  (228,'164','Common','6th','Shaikh Gholam Rabbani'),
  (229,'240','Common','6th','Shaikh Gholam Rabbani'),
  (230,'238','Common','6th','Shaikh Gholam Rabbani'),
  (231,'167','Common','6th','Shaikh Gholam Rabbani'),
  (232,'243','Common','6th','Shaikh Gholam Rabbani'),
  (233,'237','Common','6th','Shaikh Gholam Rabbani'),
  (234,'266','Common','6th','Shaikh Gholam Rabbani'),
  (235,'264','Common','6th','Maulana Raunaq'),
  (236,'166','Common','6th','Maulana Raunaq'),
  (237,'174','Common','6th','Maulana Raunaq'),
  (238,'268','Common','6th','Maulana Raunaq'),
  (239,'257','Common','6th','Aasik Khan'),
  (240,'254','Common','6th','Quari Gholam Ghaus'),
  (241,'255','Common','6th','Quari Gholam Ghaus'),
  (242,'149','Common','6th','Maulana Raunaq'),
  (243,'171','Common','6th','Hafiz Qasim'),
  (245,'256','Common','6th','Aasik Khan'),
  (247,'223','T100',NULL,'Imdad Alam'),
  (249,'211','T100',NULL,'Imdad Alam'),
  (251,'128','T50',NULL,'Muslim Raza'),
  (254,'225','T100',NULL,'Salim'),
  (255,'134','T50',NULL,'Sahil'),
  (256,'239','T100',NULL,'Sahil'),
  (257,'238','T100',NULL,'Sahil'),
  (258,'189','Common','6th','Sahil'),
  (259,'159','Common','6th','Shaikh Gholam Rabbani'),
  (260,'200','Common','6th','Faizan'),
  (261,'199','Common','6th','Faizan'),
  (262,'260','Common','6th','Aasik Khan'),
  (263,'262','Common','6th','Shamsher Bhai'),
  (264,'211','Common','6th','Salman Raza'),
  (265,'51','Common','6th','Imdad Alam'),
  (266,'212','Common','6th','Rehan Raza'),
  (267,'208','Common','6th','Nurul Qamar'),
  (268,'181','Common','6th','Abdul Rahim'),
  (269,'201','Common','6th','Gulzar Ahmad'),
  (271,'197','Common','6th','Irfan'),
  (272,'248','Common','6th','Aasik Khan'),
  (273,'247','Common','6th','Aasik Khan'),
  (274,'249','Common','6th','Aasik Khan'),
  (294,'136','T50',NULL,'Mohammad Yasin'),
  (295,'267','Common','6th','M Saiyed Manzar Husain'),
  (296,'196','Common','6th','Rehan'),
  (297,'206','Common','6th','Sarfaraz'),
  (298,'194','Common','6th','Soroor Ali'),
  (299,'193','Common','6th','Soroor Ali'),
  (300,'213','Common','6th','Abu Salik'),
  (301,'191','Common','6th','Modassir Husain'),
  (302,'259','Common','6th','Aasik Khan'),
  (304,'67','Common','6th','Dilbar Raza'),
  (305,'225','Common','6th','Hasnain'),
  (306,'222','Common','6th','Asrar Ahmad'),
  (307,'246','Common','6th','Bani Kund Imam'),
  (308,'263','Common','6th','Bani Kund Imam'),
  (310,'79','Common','6th','Aasik Khan'),
  (311,'204','Common','6th','Faisal'),
  (312,'244','Common','6th','Saiyed Abdul Aziz'),
  (313,'245','Common','6th','Saiyed Abdul Aziz'),
  (314,'210','Common','6th','Nizami'),
  (315,'219','Common','6th','Aasik Khan'),
  (316,'177','Common','6th','Sona Bhai'),
  (317,'215','Common','6th','Aasik Khan'),
  (319,'163','Common','6th','Aasik Khan'),
  (320,'170','Common','6th','Hafiz Azhar'),
  (321,'176','Common','6th','Mohammad Imteyaz'),
  (322,'175','Common','6th','Abdul Hafiz');

INSERT INTO dms_finished_source VALUES
  (2,'666','Common','5th','Qamrul Islam','Continue',NULL),
  (6,'627','Common','5th','Hafiz Moez Uddin','Continue',NULL),
  (7,'628','Common','5th','Hafiz Moez Uddin','Continue',NULL),
  (11,'650','Common','5th','Zahir','Continue',NULL),
  (12,'6','Common','6th',NULL,'Blank',NULL),
  (62,'425','Common','4th','Quari Bilal Ahmad','Not Used',0),
  (63,'426','Common','4th','Quari Bilal Ahmad','Not Used',0),
  (73,'484','Common','5th','Firoz','Not Used',0),
  (74,'485','Common','5th','Firoz','Not Used',0),
  (75,'487','Common','5th','Firoz','Not Used',0),
  (80,'696','Common','5th','Danish Raza','Not Used',0),
  (81,'493','Common','5th','Iftekhar','Not Used',0),
  (82,'483','Common','4th','Amanatullah','Not Used',0),
  (92,'440','Common','4th','Shaikh Riyazat Husain','Continue',NULL),
  (112,'95','Common','6th','Syed Mujahid','Continue',NULL),
  (114,'149','Common','6th','Maulana Raunaq','Continue',NULL),
  (121,'211','T100','1st','Imdad Alam','Continue',NULL),
  (122,'18','Common','6th','Ahmad Raza','Continue',NULL),
  (124,'104','T50','1st','Imdad Alam','Continue',NULL),
  (148,'442','Common','4th','Aasik Khan','Continue',NULL),
  (157,'105','Common','6th','Mujahid Raza','Continue',NULL),
  (160,'28','Common','6th','Shaikh Akmal Husain','Continue',NULL),
  (178,'97','Common','6th',NULL,'Not Used',NULL),
  (179,'78','Common','6th',NULL,'Not Used',NULL),
  (180,'110','Common','6th',NULL,'Not Used',NULL),
  (181,'77','Common','6th',NULL,'Not Used',NULL),
  (182,'76','Common','6th',NULL,'Not Used',NULL),
  (183,'75','Common','6th',NULL,'Not Used',NULL),
  (184,'74','Common','6th',NULL,'Not Used',NULL),
  (185,'83','Common','6th',NULL,'Not Used',NULL),
  (186,'83','Common','6th',NULL,'Not Used',NULL),
  (187,'140','Common','6th',NULL,'Not Used',NULL),
  (189,'430','Common','5th','Dilbar Raza','Continue',NULL),
  (190,'50','Common','6th','Aasik Khan','Continue',NULL),
  (200,'67','Common','6th','Dilbar Raza','Continue',NULL),
  (208,'79','Common','6th','Aasik Khan','Continue',NULL),
  (209,'103','Common','6th','Tanweer','Not Used',0),
  (210,'104','Common','6th','Tanweer','Not Used',0),
  (211,'212','T100','1st','Tanweer','Not Used',0),
  (212,'111','T50','1st','Tanweer','Not Used',0),
  (216,'163','Common','2nd','Badal Kumar','Blank',NULL),
  (244,'151','Common','6th','Maulana Azizul Karim','Blank',NULL),
  (246,'234','T100',NULL,'Sahil','Not Used',0),
  (248,'126','T50',NULL,'Imdad Alam','Not Used',0),
  (250,'95','Common','6th','Maulana Saiyed Mujahid','Continue',NULL),
  (252,'125','T50',NULL,'Alauddin','Blank',NULL),
  (253,'216','T100',NULL,'Mohammad Arshad Mulla','Blank',NULL),
  (270,'186','Common','6th','Mujahid Husain','Not Used',8200),
  (275,'132','T50',NULL,'Sarfaraz','Not Used',NULL),
  (276,'235','T100',NULL,'Sarfaraz','Not Used',NULL),
  (277,'122','T50',NULL,'Sahil','Not Used',NULL),
  (278,'229','T100',NULL,'Arshad','Not Used',NULL),
  (279,'187','Common','6th','Mujahid','Not Used',NULL),
  (280,'188','Common','6th','Mujahid','Not Used',NULL),
  (281,'230','Common','6th','Mufti Tanveer Markazi','Not Used',NULL),
  (282,'190','Common','6th','Sahil','Not Used',NULL),
  (283,'190','Common','6th','Sahil','Not Used',NULL),
  (284,'218','Common','6th','Imran','Not Used',NULL),
  (285,'207','Common','6th','Mujeem','Not Used',NULL),
  (286,'227','T100',NULL,'Iftekhar','Not Used',0),
  (287,'129','T50',NULL,'Iftekhar','Not Used',0),
  (288,'130','T50',NULL,'Iftekhar','Not Used',0),
  (289,'131','T50',NULL,'Iftekhar','Not Used',0),
  (290,'124','T50',NULL,'Iftekhar','Not Used',0),
  (291,'226','Common','6th','Hasnain','Not Used',0),
  (292,'223',NULL,NULL,'Iftekhar','Not Used',0),
  (293,'192',NULL,NULL,'Mohammad Yasin','Not Used',0),
  (303,'258','Common','6th','Aasik Khan','Continue',NULL),
  (309,'209','Common','6th','Ramzani','Not Used',10650),
  (318,'173','Common','6th','Ahmad Raza','Continue',NULL);

-- Retry the complete blank-condition row and unused rows with an exact stock match.
-- Keep the original payload in the ledger. A Not Used return has zero receipts or collections.
CREATE TEMP TABLE dms_status_retry (excel_row integer PRIMARY KEY, book_id uuid NOT NULL, payload jsonb NOT NULL) ON COMMIT DROP;
DO $$
DECLARE source record; target_book uuid; stock_number integer; source_profile integer; printed_edition integer; original_number integer;
BEGIN
  FOR source IN
    SELECT s.*, l.source_data AS original
    FROM dms_finished_source s JOIN public.legacy_collection_imports l ON l.source_key='Book3_v1:Sheet1:'||s.excel_row::text
    WHERE l.status='SKIPPED' AND s.fundraiser IS NOT NULL AND s.book_number ~ '^[0-9]{1,8}$'
      AND s.edition ~ '^[0-9]{1,4}(st|nd|rd|th)$' AND s.book_type IN ('Common','T10','T50','T100')
      AND btrim(l.source_data->>'Book No.')=s.book_number AND btrim(l.source_data->>'Edition')=s.edition
      AND btrim(l.source_data->>'Type')=s.book_type
      AND l.source_data->>'Entry Date' ~ '^\d{4}-\d{2}-\d{2}' AND l.source_data->>'Collection Date' ~ '^\d{4}-\d{2}-\d{2}'
      AND nullif(btrim(l.source_data->>'Collection Area'),'') IS NOT NULL AND nullif(btrim(l.source_data->>'Entry by'),'') IS NOT NULL
      AND ((s.excel_row=244 AND s.condition='Blank' AND l.source_data->>'Collection Amount'='10000'
            AND l.source_data->>'Commission Amount'='5000')
        OR (s.condition='Not Used' AND coalesce(s.collection_rupees,0)=0
          AND coalesce(l.source_data->>'Collection Amount','0')='0' AND coalesce(l.source_data->>'Commission Amount','0')='0'))
      AND NOT EXISTS (SELECT 1 FROM dms_finished_source other WHERE other.excel_row<>s.excel_row
        AND (other.book_number,other.book_type,other.edition)=(s.book_number,s.book_type,s.edition)
        AND (other.fundraiser IS DISTINCT FROM s.fundraiser OR other.condition<>s.condition OR coalesce(other.collection_rupees,0)<>0))
  LOOP
    printed_edition:=substring(source.edition from '^[0-9]+')::integer;
    original_number:=source.book_number::integer;
    SELECT (array_agg(b.id))[1], min(b.edition_book_number) INTO target_book, stock_number
    FROM public.books b JOIN public.master_records m ON m.id=b.edition_id
    WHERE b.edition_number=printed_edition AND b.deleted_at IS NULL AND m.deleted_at IS NULL AND m.kind='EDITION'
      AND CASE WHEN source.book_type='Common' THEN b.book_type='REGULAR' AND m.pages_per_book=50 AND
        CASE WHEN printed_edition<=5 THEN b.receipt_from=1+(original_number::bigint-1)*50
          ELSE b.receipt_from=m.pages_from+(original_number::bigint-1)*50 END
        ELSE b.book_type='TOKEN' AND b.edition_book_number=original_number
          AND b.token_value_paise=substring(source.book_type from '[0-9]+$')::integer*100 END
    HAVING count(*)=1 AND min(b.status)='IN_STOCK';

    SELECT min(split_part(f.legacy_import_key,':',2)::integer) INTO source_profile
    FROM public.fundraisers f JOIN public.people p ON p.id=f.person_id
    WHERE p.full_name=source.fundraiser AND f.deleted_at IS NULL AND p.deleted_at IS NULL AND p.role='COLLECTOR'
      AND f.legacy_import_key ~ '^Fundraisers_Data_v1:[0-9]+$'
    HAVING count(*)=1;
    IF target_book IS NULL OR stock_number IS NULL OR source_profile IS NULL
      OR EXISTS (SELECT 1 FROM public.book_cases c WHERE c.book_id=target_book) THEN CONTINUE; END IF;

    -- For regular editions 2–5 the installed historical importer uses the original printed number.
    INSERT INTO dms_status_retry VALUES (source.excel_row,target_book,jsonb_build_object(
      'source_row',source.excel_row,'profile_source_id',source_profile,'fundraiser_name',source.fundraiser,
      'book_number',CASE WHEN source.book_type='Common' AND printed_edition BETWEEN 2 AND 5 THEN original_number ELSE stock_number END,
      'book_type',CASE WHEN source.book_type='Common' THEN 'REGULAR' ELSE 'TOKEN' END,'edition_number',printed_edition,
      'token_paise',substring(source.book_type from '[0-9]+$')::integer*100,
      'entry_date',left(source.original->>'Entry Date',10),'collection_date',left(source.original->>'Collection Date',10),
      'collection_area',source.original->>'Collection Area','book_condition',source.condition,
      'amount_paise',coalesce((source.original->>'Collection Amount')::numeric,0)*100,
      'commission_paise',coalesce((source.original->>'Commission Amount')::numeric,0)*100,
      'entry_by',source.original->>'Entry by','amount_words',CASE WHEN source.excel_row=244 THEN 'Rupees Ten Thousand Only' ELSE 'Rupees Zero Only' END,
      'problems','','raw',source.original));
  END LOOP;

  IF EXISTS (SELECT 1 FROM dms_status_retry) THEN
    PERFORM public.import_book3_collection_drafts((SELECT jsonb_agg(payload ORDER BY excel_row) FROM dms_status_retry));
    IF EXISTS (SELECT 1 FROM dms_status_retry retry JOIN public.legacy_collection_imports l
      ON l.source_key='Book3_v1:Sheet1:'||retry.excel_row::text
      WHERE l.status='IMPORTED' AND l.book_id IS DISTINCT FROM retry.book_id) THEN
      RAISE EXCEPTION 'Historical retry linked to an unexpected stock book; no changes committed';
    END IF;
  END IF;
END $$;

CREATE TEMP TABLE dms_finished_review ON COMMIT DROP AS
SELECT s.*, l.return_id, left(l.source_data->>'Collection Date',10) AS collection_day,
  b.book_number AS assigned_book, a.number AS assignment_number,
  CASE
    WHEN s.condition='Not Used' AND s.collection_rupees<>0 THEN 'Not Used conflicts with a recorded collection amount'
    WHEN s.edition IS NULL OR s.book_number IS NULL OR s.fundraiser IS NULL THEN 'Incomplete workbook identity'
    WHEN s.book_type IS NULL OR lower(s.book_type) NOT IN ('common','t10','t50','t100') THEN 'Unsupported workbook book type'
    WHEN l.source_key IS NULL THEN 'Original import row missing'
    WHEN btrim(l.source_data->>'Book No.') IS DISTINCT FROM s.book_number
      OR lower(btrim(l.source_data->>'Edition')) IS DISTINCT FROM lower(s.edition)
      OR lower(btrim(l.source_data->>'Type')) IS DISTINCT FROM lower(s.book_type) THEN 'Workbook and original import book identity differ'
    WHEN l.status <> 'IMPORTED' THEN 'Source row was not imported: ' || l.reason
    WHEN r.id IS NULL OR c.id IS NULL OR a.id IS NULL OR b.id IS NULL OR p.id IS NULL
      OR l.person_id IS DISTINCT FROM a.collector_id
      OR regexp_replace(lower(btrim(p.full_name)), '[[:space:]]+', ' ', 'g')
        IS DISTINCT FROM regexp_replace(lower(btrim(s.fundraiser)), '[[:space:]]+', ' ', 'g')
      OR b.edition_number IS DISTINCT FROM substring(s.edition from '^[0-9]+')::integer
      OR b.book_type IS DISTINCT FROM CASE WHEN lower(s.book_type) = 'common' THEN 'REGULAR' ELSE 'TOKEN' END
      OR (lower(s.book_type) <> 'common'
        AND b.token_value_paise IS DISTINCT FROM substring(s.book_type from '[0-9]+$')::integer * 100)
      THEN 'Linked assignment, edition, book type, or corrected fundraiser does not match'
    WHEN s.condition='Continue' AND r.finalized_at IS NULL AND c.closed_at IS NULL AND r.submission_pending THEN 'In progress'
    WHEN s.condition='Continue' THEN 'Continue shares a finalized submission; see the other workbook rows'
    WHEN s.condition='Not Used' AND r.finalized_at IS NOT NULL AND c.closed_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.leftover_books tail WHERE tail.return_id=r.id AND tail.deleted_at IS NULL
        AND tail.receipt_from=r.receipt_from AND tail.receipt_to=r.receipt_to) THEN 'Already in Leftover Books'
    WHEN s.condition='Not Used' AND (r.total_paise<>0 OR r.commission_paise<>0 OR r.receipts_used<>0 OR r.last_used IS NOT NULL
      OR jsonb_array_length(r.exceptions)<>0) THEN 'Submission has money or used receipts; full range cannot be released'
    WHEN s.condition='Not Used' AND r.finalized_at IS NOT NULL THEN 'Finalized without a full leftover range; review required'
    WHEN r.finalized_at IS NOT NULL AND c.closed_at IS NOT NULL THEN 'Already closed'
    WHEN r.reopened_at IS NOT NULL THEN 'Reopened by Super Admin'
    WHEN r.finalized_at IS NOT NULL OR c.closed_at IS NOT NULL OR NOT r.submission_pending
      OR c.source <> 'NEW' OR b.status <> 'ASSIGNED' OR r.outcome = 'FLAGGED' OR r.receipt_entry_status = 'FLAGGED'
      OR r.receipt_from <> c.receipt_from OR r.receipt_to <> c.receipt_to
      THEN 'Current book state requires review'
    WHEN EXISTS (SELECT 1 FROM public.book_cases other WHERE other.book_id=b.id AND other.id<>c.id AND other.closed_at IS NULL)
      OR EXISTS (SELECT 1 FROM public.book_returns later WHERE later.book_id=b.id AND later.id<>r.id
        AND later.deleted_at IS NULL AND later.created_at>=r.created_at)
      OR EXISTS (SELECT 1 FROM public.leftover_books tail WHERE tail.book_id=b.id AND tail.deleted_at IS NULL)
      THEN 'Book has a later or competing assignment or leftover range'
    WHEN EXISTS (SELECT 1 FROM public.book_flags flag WHERE flag.book_id=b.id AND flag.deleted_at IS NULL AND flag.status<>'RESOLVED')
      OR EXISTS (SELECT 1 FROM public.receipt_issues issue WHERE issue.return_id=r.id AND issue.status='OPEN')
      THEN 'Book has unresolved issues'
    WHEN EXISTS (
      SELECT 1 FROM public.legacy_collection_imports linked
      WHERE linked.return_id=r.id AND linked.status='IMPORTED'
        AND (linked.person_id IS DISTINCT FROM a.collector_id OR linked.book_id IS DISTINCT FROM b.id
          OR btrim(linked.source_data->>'Book No.') IS DISTINCT FROM s.book_number
          OR lower(btrim(linked.source_data->>'Edition')) IS DISTINCT FROM lower(s.edition)
          OR lower(btrim(linked.source_data->>'Type')) IS DISTINCT FROM lower(s.book_type))
    ) THEN 'Submission combines different historical book identities'
    WHEN NOT EXISTS (
      SELECT 1 FROM public.book_receipts receipt
      WHERE receipt.return_id=r.id AND receipt.deleted_at IS NULL
      HAVING count(*)=r.receipts_used AND max(receipt.receipt_number) IS NOT DISTINCT FROM r.last_used
        AND (count(*)=0 OR (min(receipt.receipt_number)=r.receipt_from AND r.last_used-r.receipt_from+1=count(*)))
        AND coalesce(sum(receipt.amount_paise),0)=r.total_paise AND r.total_paise=r.cash_paise
        AND r.total_paise=r.receipt_sum_paise AND r.digital_paise=0
        AND count(*) FILTER (WHERE receipt.status<>'VALID' OR receipt.version<>1
          OR receipt.data->>'paymentMode' IS DISTINCT FROM 'CASH'
          OR NOT EXISTS (
            SELECT 1 FROM public.legacy_collection_imports original
            WHERE original.receipt_id=receipt.id AND original.return_id=r.id AND original.status='IMPORTED'
              AND original.source_key LIKE 'Book3_v1:Sheet1:%'
              AND original.assumed_receipt_number=receipt.receipt_number
              AND receipt.amount_paise=(original.source_data->>'Collection Amount')::numeric*100
          ))=0
    ) THEN 'Receipt summaries or totals differ from the import'
    ELSE 'Ready'
  END AS result
FROM dms_finished_source s
LEFT JOIN public.legacy_collection_imports l ON l.source_key='Book3_v1:Sheet1:'||s.excel_row::text
LEFT JOIN public.book_returns r ON r.id=l.return_id AND r.book_id=l.book_id AND r.assignment_id=l.assignment_id AND r.deleted_at IS NULL
LEFT JOIN public.book_cases c ON c.id=r.case_id AND c.book_id=r.book_id AND c.assignment_id=r.assignment_id
LEFT JOIN public.book_assignments a ON a.id=r.assignment_id AND a.deleted_at IS NULL
LEFT JOIN public.people p ON p.id=a.collector_id AND p.role='COLLECTOR' AND p.deleted_at IS NULL
LEFT JOIN public.books b ON b.id=r.book_id AND b.deleted_at IS NULL;

CREATE TEMP TABLE dms_finished_targets ON COMMIT DROP AS
SELECT r.id, r.case_id, r.book_id, r.assignment_id, to_jsonb(r) AS previous_return,
  array_agg(review.excel_row ORDER BY review.excel_row) AS excel_rows,
  bool_and(review.condition='Not Used') AS unused
FROM public.book_returns r JOIN dms_finished_review review ON review.return_id=r.id
WHERE review.condition<>'Continue'
GROUP BY r.id
HAVING bool_and(review.result='Ready') AND count(DISTINCT (review.condition='Not Used'))=1
  AND coalesce((SELECT max(continuing.collection_day) FROM dms_finished_review continuing
    WHERE continuing.return_id=r.id AND continuing.condition='Continue'), '')
      <= CASE WHEN bool_and(review.condition='Not Used') THEN '' ELSE coalesce(max(review.collection_day),'') END;

UPDATE public.book_cases c SET closed_at=now()
FROM dms_finished_targets target WHERE c.id=target.case_id;
UPDATE public.books b SET status=CASE WHEN target.unused THEN 'PARTLY_USED' ELSE 'CLOSED' END, updated_at=now()
FROM dms_finished_targets target WHERE b.id=target.book_id;
UPDATE public.book_assignments a SET updated_at=now()
WHERE EXISTS (SELECT 1 FROM dms_finished_targets target WHERE target.assignment_id=a.id);

-- Keep imported financial values and receipt usage. Only Not Used releases stock.
WITH closed AS (
  UPDATE public.book_returns r SET outcome=CASE WHEN target.unused THEN 'PARTLY_USED' ELSE 'CLOSED' END, receipt_entry_status='RECONCILED',
    finalized_at=now(), submission_pending=false, receipt_entry_version=r.receipt_entry_version+1, updated_at=now()
  FROM dms_finished_targets target WHERE r.id=target.id
  RETURNING r.id, to_jsonb(r) AS new_return
)
INSERT INTO public.activity_log(action,resource,record_id,old_values,new_values,reason)
SELECT 'FINALIZE','book_returns',closed.id::text,target.previous_return,
  closed.new_return || jsonb_build_object('workbookRows',target.excel_rows),
  CASE WHEN target.unused THEN 'Workbook Not Used; full receipt range returned to Leftover Books'
    ELSE 'Workbook Finished or blank; historical submission closed' END
FROM closed JOIN dms_finished_targets target ON target.id=closed.id;

WITH unused_ranges AS (
  SELECT r.*, a.collector_id, stock.book_number AS stock_number,
    (SELECT coalesce(max(tail.ordinal),0)+1 FROM public.leftover_books tail WHERE tail.book_id=r.book_id) AS next_ordinal
  FROM dms_finished_targets target JOIN public.book_returns r ON r.id=target.id
  JOIN public.book_assignments a ON a.id=r.assignment_id JOIN public.books stock ON stock.id=r.book_id
  WHERE target.unused
), released AS (
  INSERT INTO public.leftover_books (book_id,return_id,returned_by,code,ordinal,receipt_from,receipt_to,status,created_by,updated_by)
  SELECT book_id,id,collector_id,stock_number||'-B'||next_ordinal,next_ordinal,receipt_from,receipt_to,'AVAILABLE',created_by,updated_by
  FROM unused_ranges RETURNING *
)
INSERT INTO public.activity_log(action,resource,record_id,new_values,reason)
SELECT 'INSERT','leftover_books',released.id::text,to_jsonb(released),'Full receipt range released from a historical Not Used return'
FROM released;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM dms_finished_targets target JOIN public.book_returns r ON r.id=target.id
    WHERE (to_jsonb(r) - ARRAY['outcome','receipt_entry_status','finalized_at','submission_pending','receipt_entry_version','updated_at'])
      IS DISTINCT FROM (target.previous_return - ARRAY['outcome','receipt_entry_status','finalized_at','submission_pending','receipt_entry_version','updated_at'])
  ) THEN
    RAISE EXCEPTION 'Historical financial or receipt data changed during closure; transaction rolled back';
  END IF;
END $$;

SELECT
  (SELECT jsonb_object_agg(condition,rows) FROM (SELECT condition,count(*) AS rows FROM dms_finished_source GROUP BY condition) totals) AS workbook_row_counts,
  (SELECT count(*) FROM dms_finished_targets WHERE NOT unused) AS submissions_closed,
  (SELECT count(*) FROM dms_finished_targets WHERE unused) AS full_ranges_released,
  count(DISTINCT review.return_id) FILTER (WHERE review.result='Already closed') AS submissions_already_closed,
  count(DISTINCT review.return_id) FILTER (WHERE review.result='Already in Leftover Books') AS full_ranges_already_released,
  count(DISTINCT review.return_id) FILTER (WHERE review.result='In progress' AND target.id IS NULL) AS continue_submissions_still_open,
  coalesce(jsonb_agg(jsonb_build_object(
    'excelRow',review.excel_row,'condition',review.condition,'fundraiser',review.fundraiser,'edition',review.edition,'originalBook',review.book_number,
    'assignedBook',review.assigned_book,'assignment',review.assignment_number,
    'reason',CASE WHEN review.result='Ready' THEN 'Conflicting or unmatched workbook rows for this submission' ELSE review.result END
  ) ORDER BY review.excel_row) FILTER (WHERE target.id IS NULL
    AND review.result NOT IN ('Already closed','Already in Leftover Books','In progress')
    AND NOT (review.condition='Continue' AND EXISTS (
      SELECT 1 FROM dms_finished_review terminal WHERE terminal.return_id=review.return_id
        AND terminal.condition IN ('Finished','Blank') AND terminal.result='Already closed'
        AND terminal.collection_day>=review.collection_day
    ))),'[]'::jsonb) AS skipped_rows
FROM dms_finished_review review LEFT JOIN dms_finished_targets target ON target.id=review.return_id;
COMMIT;
